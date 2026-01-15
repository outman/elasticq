/**
 * Elasticsearch DSL Parser
 * 解析 DSL 并返回当前位置的上下文信息
 * 类似 Kibana Dev Tools 的实现方式
 */

/**
 * 解析 DSL 并获取光标位置的上下文
 * @param {string} code - 完整的 DSL 代码
 * @param {number} offset - 光标位置（从 0 开始）
 * @returns {Object} 上下文信息
 */
export function getDSLContext(code, offset) {
  try {
    // 1. 尝试解析完整的 JSON
    let ast
    try {
      ast = JSON.parse(code)
    } catch (e) {
      // JSON 不完整，尝试部分解析
      ast = partialParse(code)
    }

    // 2. 找到光标位置的路径
    const path = findPathToOffset(ast, code, offset)

    // 3. 分析路径获取上下文
    return analyzePath(path, code, offset)
  } catch (error) {
    console.error('[DSL Parser] Error:', error)
    return getDefaultContext()
  }
}

/**
 * 部分解析不完整的 JSON
 * 去除末尾不完整的部分后再解析
 */
function partialParse(code) {
  // 移除末尾未完成的部分
  let truncated = code

  // 从后往前找最后一个完整的结构
  const braceCount = { '{': 0, '}': 0, '[': 0, ']': 0 }
  let inString = false
  let escapeNext = false

  for (let i = 0; i < code.length; i++) {
    const char = code[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') braceCount['{']++
      if (char === '}') braceCount['}']++
      if (char === '[') braceCount['[']++
      if (char === ']') braceCount[']']++
    }
  }

  // 如果括号不匹配，尝试截断到最后一个完整位置
  if (braceCount['{'] > braceCount['}'] || braceCount['['] > braceCount[']']) {
    // 找到最后一个完整的对象
    let lastCompletePos = code.length
    let depth = 0
    inString = false

    for (let i = code.length - 1; i >= 0; i--) {
      const char = code[i]

      if (!inString) {
        if (char === '}' || char === ']') depth++
        if (char === '{' || char === '[') depth--
      }

      if (char === '"') {
        // 检查是否转义
        let escapeCount = 0
        for (let j = i - 1; j >= 0 && code[j] === '\\'; j--) {
          escapeCount++
        }
        if (escapeCount % 2 === 0) {
          inString = !inString
        }
      }

      if (depth === 0 && i < code.length - 1) {
        lastCompletePos = i + 1
        break
      }
    }

    truncated = code.substring(0, lastCompletePos)

    // 补全闭合括号
    const openBraces = (truncated.match(/\{/g) || []).length
    const closeBraces = (truncated.match(/\}/g) || []).length
    const openBrackets = (truncated.match(/\[/g) || []).length
    const closeBrackets = (truncated.match(/\]/g) || []).length

    truncated += '}'.repeat(Math.max(0, openBraces - closeBraces))
    truncated += ']'.repeat(Math.max(0, openBrackets - closeBrackets))
  }

  try {
    return JSON.parse(truncated)
  } catch (e) {
    // 如果还是失败，返回空对象
    console.log('[DSL Parser] Partial parse failed, using empty object')
    return {}
  }
}

/**
 * 找到光标位置的路径
 * @param {Object} ast - 解析后的 AST
 * @param {string} code - 原始代码
 * @param {number} offset - 光标位置
 * @returns {Array} 路径数组，如 ['query', 'bool', 'must', 0, 'match']
 */
function findPathToOffset(ast, code, offset) {
  const path = []

  // 找到光标所在的行和列
  const textBeforeOffset = code.substring(0, offset)
  const lines = textBeforeOffset.split('\n')
  const currentLine = lines[lines.length - 1]
  const lineNumber = lines.length

  // 解析前面的内容获取路径
  // 使用状态机跟踪 JSON 结构
  const state = {
    path: [],
    inString: false,
    escapeNext: false,
    currentKey: null,
    expectingKey: true,
    depth: 0,
  }

  for (let i = 0; i < offset; i++) {
    const char = code[i]
    const lineStart = code.lastIndexOf('\n', i - 1) + 1
    const col = i - lineStart + 1

    processChar(char, state, i, code)
  }

  return state.path
}

/**
 * 处理单个字符，更新状态
 */
function processChar(char, state, pos, code) {
  if (state.escapeNext) {
    state.escapeNext = false
    return
  }

  if (char === '\\') {
    state.escapeNext = true
    return
  }

  if (char === '"' && !state.escapeNext) {
    state.inString = !state.inString

    // 字符串结束时
    if (!state.inString && state.currentKey !== null) {
      // 如果期待键，现在得到了键
      if (state.expectingKey) {
        // 检查下一个非空字符是否是 :
        let nextPos = pos + 1
        while (nextPos < code.length && /\s/.test(code[nextPos])) {
          nextPos++
        }

        if (nextPos < code.length && code[nextPos] === ':') {
          state.path.push(state.currentKey)
          state.expectingKey = false
        }
        state.currentKey = null
      }
      // 如果在值位置，不处理
    } else if (state.inString) {
      // 字符串开始，设置 currentKey
      // 但需要在字符串结束时才知道是键还是值
    }

    return
  }

  // 在字符串内，不处理结构字符
  if (state.inString) {
    if (state.currentKey === null) {
      state.currentKey = ''
    }
    state.currentKey += char
    return
  }

  // 处理结构字符
  if (char === '{') {
    state.expectingKey = true
    state.depth++
  } else if (char === '}') {
    state.expectingKey = true
    if (state.path.length > 0 && typeof state.path[state.path.length - 1] === 'string') {
      state.path.pop()
    }
    state.depth--
  } else if (char === '[') {
    // 数组开始，添加一个标记
    state.path.push('[]')
    state.expectingKey = true
  } else if (char === ']') {
    if (state.path.length > 0 && state.path[state.path.length - 1] === '[]') {
      state.path.pop()
      // 更新数组索引
      if (state.path.length > 0 && typeof state.path[state.path.length - 1] === 'number') {
        state.path[state.path.length - 1]++
      }
    }
    state.expectingKey = false
  } else if (char === ',') {
    if (state.path.length > 0 && state.path[state.path.length - 1] === '[]') {
      // 在数组中，增加索引
      // 但由于我们是简化处理，这里不添加索引
    }
    state.expectingKey = true
  } else if (char === ':') {
    state.expectingKey = false
  }
}

/**
 * 分析路径获取上下文
 */
function analyzePath(path, code, offset) {
  const context = {
    path: [],
    location: 'unknown', // 'root', 'query', 'aggs', 'bool', 'field', 'unknown'
    queryType: null,
    inArray: false,
    arrayIndex: -1,
    expecting: 'key', // 'key' or 'value'
    depth: 0,
    parentKey: null,
    currentKey: null,
  }

  // 解析路径
  for (let i = 0; i < path.length; i++) {
    const item = path[i]

    if (item === '[]') {
      context.inArray = true
    } else if (typeof item === 'string') {
      context.path.push(item)
      context.parentKey = context.currentKey
      context.currentKey = item

      if (item === 'query') {
        context.location = 'query'
      } else if (item === 'aggs' || item === 'aggregations') {
        context.location = 'aggs'
      } else if (item === 'bool') {
        context.location = 'bool'
      } else if (['must', 'should', 'filter', 'must_not'].includes(item)) {
        context.location = 'bool_clause'
        context.boolClause = item
      } else if (isValidQueryType(item)) {
        context.queryType = item
      }
    } else if (typeof item === 'number') {
      context.arrayIndex = item
    }
  }

  context.depth = path.length

  // 判断期待的是键还是值
  const textBefore = code.substring(0, offset)
  const currentLine = textBefore.split('\n').pop()

  // 如果行中有 ":" 且在字符串前，则期待值
  if (currentLine.includes(':')) {
    const colonPos = currentLine.lastIndexOf(':')
    const afterColon = currentLine.substring(colonPos + 1)
    // 检查冒号后是否有未闭合的字符串
    const quotes = (afterColon.match(/"/g) || []).length
    if (quotes % 2 === 1) {
      context.expecting = 'value'
    } else if (afterColon.trim().length === 0 || afterColon.trim() === '{' || afterColon.trim() === '[') {
      context.expecting = 'key'
    } else {
      context.expecting = 'value'
    }
  } else {
    context.expecting = 'key'
  }

  return context
}

/**
 * 检查是否是有效的 query 类型
 */
function isValidQueryType(type) {
  const validTypes = [
    'match', 'match_phrase', 'match_phrase_prefix', 'match_bool_prefix',
    'multi_match', 'combined_fields', 'bool', 'boosting', 'dis_max',
    'constant_score', 'function_score', 'script_score', 'exists', 'ids',
    'prefix', 'range', 'regexp', 'wildcard', 'fuzzy', 'type', 'terms',
    'terms_set', 'term', 'nested', 'has_child', 'has_parent', 'parent_id',
    'geo_bounding_box', 'geo_distance', 'geo_polygon', 'geo_shape',
    'more_like_this', 'script', 'simple_query_string', 'query_string',
    'percolate', 'rank_feature', 'distance_feature', 'interval',
  ]
  return validTypes.includes(type)
}

/**
 * 获取默认上下文
 */
function getDefaultContext() {
  return {
    path: [],
    location: 'unknown',
    queryType: null,
    inArray: false,
    arrayIndex: -1,
    expecting: 'key',
    depth: 0,
    parentKey: null,
    currentKey: null,
  }
}

/**
 * 检查字符串是否在有效的 JSON 结构中
 */
export function isValidJSONPosition(code, offset) {
  const textBefore = code.substring(0, offset)
  const lines = textBefore.split('\n')
  const currentLine = lines[lines.length - 1]

  // 简单检查：如果当前行有未闭合的引号，可能在字符串中
  const quotes = (currentLine.match(/"/g) || []).length
  if (quotes % 2 === 1) {
    // 检查是否转义
    let escapeCount = 0
    for (let i = currentLine.length - 1; i >= 0 && currentLine[i] === '\\'; i--) {
      escapeCount++
    }
    if (escapeCount % 2 === 0) {
      return true // 在字符串中，有效
    }
  }

  return true
}
