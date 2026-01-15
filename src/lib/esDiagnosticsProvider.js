/**
 * Elasticsearch DSL Diagnostics Provider
 * 提供 DSL 语法验证、字段类型检查等功能
 */

import * as monaco from 'monaco-editor'

/**
 * 验证错误严重级别
 */
const Severity = {
  Error: monaco.MarkerSeverity.Error,
  Warning: monaco.MarkerSeverity.Warning,
  Info: monaco.MarkerSeverity.Info,
}

/**
 * DSL 验证器类
 */
class ESValidator {
  constructor() {
    this.currentFields = {}
  }

  /**
   * 更新当前可用字段
   */
  updateFields(fields) {
    this.currentFields = fields || {}
  }

  /**
   * 验证 DSL 查询
   * @param {string} dslText JSON 格式的 DSL 文本
   * @returns {Array} 验证错误列表
   */
  validate(dslText) {
    const errors = []

    try {
      // 1. 验证 JSON 格式
      const query = JSON.parse(dslText)

      // 2. 验证顶层结构
      this.validateTopLevel(query, errors)

      // 3. 验证 query 部分
      if (query.query) {
        this.validateQuery(query.query, errors, ['query'])
      }

      // 4. 验证 aggregations
      if (query.aggs || query.aggregations) {
        const aggs = query.aggs || query.aggregations
        this.validateAggregations(aggs, errors, ['aggs'])
      }

      // 5. 验证 sort
      if (query.sort) {
        this.validateSort(query.sort, errors)
      }

      // 6. 验证其他常见字段
      this.validateCommonFields(query, errors)

    } catch (e) {
      // JSON 解析错误
      const match = e.message.match(/position (\d+)/)
      const position = match ? parseInt(match[1]) : 0
      const { lineNumber, column } = this.getErrorPosition(dslText, position)

      errors.push({
        severity: Severity.Error,
        message: `JSON syntax error: ${e.message}`,
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + 1,
      })
    }

    return errors
  }

  /**
   * 获取错误位置
   */
  getErrorPosition(text, position) {
    const lines = text.substring(0, position).split('\n')
    return {
      lineNumber: lines.length,
      column: lines[lines.length - 1].length + 1,
    }
  }

  /**
   * 验证顶层结构
   */
  validateTopLevel(query, errors) {
    if (typeof query !== 'object' || query === null) {
      errors.push({
        severity: Severity.Error,
        message: 'Root must be an object',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
      })
      return
    }

    // 检查未知字段
    const validTopLevelFields = [
      'query', 'aggs', 'aggregations', 'sort', 'size', 'from',
      'timeout', 'track_total_hits', 'track_scores', 'min_score',
      'source', '_source', 'fields', 'script_fields', 'explain',
      'profile', 'highlight', 'rescore', 'search_after', 'collapse',
    ]

    for (const key in query) {
      if (!validTopLevelFields.includes(key)) {
        errors.push({
          severity: Severity.Warning,
          message: `Unknown top-level field: "${key}"`,
        })
      }
    }
  }

  /**
   * 验证 query 部分
   */
  validateQuery(query, errors, path) {
    if (typeof query !== 'object' || query === null) {
      errors.push({
        severity: Severity.Error,
        message: 'Query must be an object',
        path,
      })
      return
    }

    for (const queryType in query) {
      const queryValue = query[queryType]

      // 验证 query 类型
      if (!this.isValidQueryType(queryType)) {
        errors.push({
          severity: Severity.Error,
          message: `Unknown query type: "${queryType}"`,
          path: [...path, queryType],
        })
        continue
      }

      // 根据不同 query 类型进行验证
      switch (queryType) {
        case 'bool':
          this.validateBoolQuery(queryValue, errors, [...path, queryType])
          break

        case 'match':
        case 'match_phrase':
        case 'match_phrase_prefix':
          this.validateMatchQuery(queryValue, errors, [...path, queryType])
          break

        case 'term':
        case 'terms':
          this.validateTermQuery(queryValue, errors, [...path, queryType])
          break

        case 'range':
          this.validateRangeQuery(queryValue, errors, [...path, queryType])
          break

        case 'exists':
          this.validateExistsQuery(queryValue, errors, [...path, queryType])
          break

        case 'multi_match':
          this.validateMultiMatchQuery(queryValue, errors, [...path, queryType])
          break

        case 'nested':
          this.validateNestedQuery(queryValue, errors, [...path, queryType])
          break

        default:
          // 其他 query 类型，验证基本结构
          if (typeof queryValue !== 'object' || queryValue === null) {
            errors.push({
              severity: Severity.Error,
              message: `"${queryType}" query must be an object`,
              path: [...path, queryType],
            })
          }
      }
    }
  }

  /**
   * 检查是否是有效的 query 类型
   */
  isValidQueryType(type) {
    const validTypes = [
      'match', 'match_phrase', 'match_phrase_prefix', 'match_bool_prefix',
      'multi_match', 'combined_fields', 'bool', 'boosting', 'dis_max',
      'constant_score', 'function_score', 'script_score', 'exists', 'ids',
      'prefix', 'range', 'regexp', 'wildcard', 'fuzzy', 'type', 'terms',
      'terms_set', 'term', 'nested', 'has_child', 'has_parent', 'parent_id',
      'geo_bounding_box', 'geo_distance', 'geo_polygon', 'geo_shape',
      'more_like_this', 'script', 'simple_query_string', 'query_string',
      'percolate', 'rank_feature', 'distance_feature', 'interval',
      'span_term', 'span_multi', 'span_first', 'span_near', 'span_or',
      'span_not', 'span_containing', 'span_within', 'span_field_masking',
    ]
    return validTypes.includes(type)
  }

  /**
   * 验证 bool query
   */
  validateBoolQuery(boolQuery, errors, path) {
    if (typeof boolQuery !== 'object' || boolQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'bool query must be an object',
        path,
      })
      return
    }

    const validClauses = ['must', 'filter', 'should', 'must_not']

    for (const clause in boolQuery) {
      // 跳过数组索引
      if (/^\d+$/.test(clause)) {
        continue
      }

      if (!validClauses.includes(clause)) {
        errors.push({
          severity: Severity.Error,
          message: `Unknown bool clause: "${clause}". Valid clauses are: ${validClauses.join(', ')}`,
          path: [...path, clause],
        })
        continue
      }

      const clauseValue = boolQuery[clause]
      if (!Array.isArray(clauseValue)) {
        errors.push({
          severity: Severity.Error,
          message: `"${clause}" must be an array`,
          path: [...path, clause],
        })
        continue
      }

      // 验证子查询
      clauseValue.forEach((subQuery, index) => {
        this.validateQuery(subQuery, errors, [...path, clause])
      })
    }
  }

  /**
   * 验证 match query
   */
  validateMatchQuery(matchQuery, errors, path) {
    if (typeof matchQuery !== 'object' || matchQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'match query must be an object',
        path,
      })
      return
    }

    // 检查是否至少有一个字段
    if (Object.keys(matchQuery).length === 0) {
      errors.push({
        severity: Severity.Error,
        message: 'match query requires at least one field',
        path,
      })
      return
    }

    // 验证字段
    for (const fieldName in matchQuery) {
      // 检查字段是否存在于 mapping
      if (this.currentFields && !this.currentFields[fieldName]) {
        errors.push({
          severity: Severity.Warning,
          message: `Field "${fieldName}" not found in mapping`,
          path: [...path, fieldName],
        })
      }

      // 验证字段值
      const fieldValue = matchQuery[fieldName]
      if (typeof fieldValue === 'object' && fieldValue !== null) {
        // 验证 match query 选项
        this.validateMatchOptions(fieldValue, errors, [...path, fieldName])
      }
    }
  }

  /**
   * 验证 match query 选项
   */
  validateMatchOptions(options, errors, path) {
    const validOptions = [
      'query', 'analyzer', 'boost', 'operator', 'minimum_should_match',
      'fuzziness', 'prefix_length', 'max_expansions', 'zero_terms_query',
      'lenient', 'cutoff_frequency', 'auto_generate_synonyms_phrase_query',
    ]

    for (const option in options) {
      if (!validOptions.includes(option)) {
        errors.push({
          severity: Severity.Warning,
          message: `Unknown match query option: "${option}"`,
          path: [...path, option],
        })
      }

      // 验证 operator 值
      if (option === 'operator' && !['and', 'or'].includes(options[option])) {
        errors.push({
          severity: Severity.Error,
          message: `operator must be "and" or "or", got "${options[option]}"`,
          path: [...path, option],
        })
      }
    }
  }

  /**
   * 验证 term query
   */
  validateTermQuery(termQuery, errors, path) {
    if (typeof termQuery !== 'object' || termQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'term query must be an object',
        path,
      })
      return
    }

    for (const fieldName in termQuery) {
      if (!this.currentFields[fieldName]) {
        errors.push({
          severity: Severity.Warning,
          message: `Field "${fieldName}" not found in mapping`,
          path: [...path, fieldName],
        })
      }

      const fieldValue = termQuery[fieldName]

      // 对于 term query，值应该是简单类型或数组
      if (typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
        errors.push({
          severity: Severity.Error,
          message: `term query value for "${fieldName}" should be a simple value or array`,
          path: [...path, fieldName],
        })
      }
    }
  }

  /**
   * 验证 range query
   */
  validateRangeQuery(rangeQuery, errors, path) {
    if (typeof rangeQuery !== 'object' || rangeQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'range query must be an object',
        path,
      })
      return
    }

    // range query 只能有一个字段
    const fields = Object.keys(rangeQuery)
    if (fields.length !== 1) {
      errors.push({
        severity: Severity.Error,
        message: 'range query must have exactly one field',
        path,
      })
      return
    }

    const fieldName = fields[0]
    const rangeValue = rangeQuery[fieldName]

    if (typeof rangeValue !== 'object' || rangeValue === null || Array.isArray(rangeValue)) {
      errors.push({
        severity: Severity.Error,
        message: `range query value for "${fieldName}" must be an object with range operators`,
        path: [...path, fieldName],
      })
      return
    }

    // 验证范围操作符
    const validOperators = ['gt', 'gte', 'lt', 'lte', 'format', 'time_zone']
    const operators = Object.keys(rangeValue)

    if (operators.length === 0) {
      errors.push({
        severity: Severity.Error,
        message: 'range query requires at least one range operator (gt, gte, lt, lte)',
        path: [...path, fieldName],
      })
      return
    }

    for (const op of operators) {
      if (!validOperators.includes(op)) {
        errors.push({
          severity: Severity.Error,
          message: `Unknown range operator: "${op}". Valid operators are: ${validOperators.join(', ')}`,
          path: [...path, fieldName, op],
        })
      }
    }

    // 检查字段类型
    if (this.currentFields[fieldName]) {
      const fieldType = this.currentFields[fieldName].type
      if (!['integer', 'long', 'float', 'double', 'date', 'ip'].includes(fieldType)) {
        errors.push({
          severity: Severity.Warning,
          message: `range query is typically used with numeric/date fields, got "${fieldType}"`,
          path: [...path, fieldName],
        })
      }
    }
  }

  /**
   * 验证 exists query
   */
  validateExistsQuery(existsQuery, errors, path) {
    if (typeof existsQuery !== 'object' || existsQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'exists query must be an object',
        path,
      })
      return
    }

    if (!existsQuery.field || typeof existsQuery.field !== 'string') {
      errors.push({
        severity: Severity.Error,
        message: 'exists query requires a "field" property with a string value',
        path,
      })
      return
    }

    // 检查字段是否存在
    if (!this.currentFields[existsQuery.field]) {
      errors.push({
        severity: Severity.Warning,
        message: `Field "${existsQuery.field}" not found in mapping`,
        path: [...path, 'field'],
      })
    }
  }

  /**
   * 验证 multi_match query
   */
  validateMultiMatchQuery(multiMatchQuery, errors, path) {
    if (typeof multiMatchQuery !== 'object' || multiMatchQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'multi_match query must be an object',
        path,
      })
      return
    }

    // 必需字段
    if (!multiMatchQuery.query) {
      errors.push({
        severity: Severity.Error,
        message: 'multi_match query requires "query" property',
        path,
      })
    }

    if (!multiMatchQuery.fields) {
      errors.push({
        severity: Severity.Error,
        message: 'multi_match query requires "fields" property (array)',
        path,
      })
      return
    }

    if (!Array.isArray(multiMatchQuery.fields)) {
      errors.push({
        severity: Severity.Error,
        message: '"fields" must be an array',
        path: [...path, 'fields'],
      })
      return
    }

    // 验证字段
    multiMatchQuery.fields.forEach((field, index) => {
      // 处理带权重的字段 (如 "title^2")
      const fieldName = field.split('^')[0]
      if (!this.currentFields[fieldName]) {
        errors.push({
          severity: Severity.Warning,
          message: `Field "${fieldName}" not found in mapping`,
          path: [...path, 'fields', index],
        })
      }
    })
  }

  /**
   * 验证 nested query
   */
  validateNestedQuery(nestedQuery, errors, path) {
    if (typeof nestedQuery !== 'object' || nestedQuery === null) {
      errors.push({
        severity: Severity.Error,
        message: 'nested query must be an object',
        path,
      })
      return
    }

    if (!nestedQuery.path) {
      errors.push({
        severity: Severity.Error,
        message: 'nested query requires "path" property',
        path,
      })
      return
    }

    if (!nestedQuery.query) {
      errors.push({
        severity: Severity.Error,
        message: 'nested query requires "query" property',
        path,
      })
    } else {
      this.validateQuery(nestedQuery.query, errors, [...path, 'query'])
    }

    // 验证 path 是否是 nested 字段
    const nestedField = this.currentFields[nestedQuery.path]
    if (nestedField && !nestedField.isNested) {
      errors.push({
        severity: Severity.Error,
        message: `Field "${nestedQuery.path}" is not a nested field`,
        path: [...path, 'path'],
      })
    }
  }

  /**
   * 验证 aggregations
   */
  validateAggregations(aggs, errors, path) {
    if (typeof aggs !== 'object' || aggs === null) {
      errors.push({
        severity: Severity.Error,
        message: 'aggregations must be an object',
        path,
      })
      return
    }

    for (const aggName in aggs) {
      // 跳过数组索引
      if (/^\d+$/.test(aggName)) {
        continue
      }

      const aggValue = aggs[aggName]

      if (typeof aggValue !== 'object' || aggValue === null) {
        errors.push({
          severity: Severity.Error,
          message: `Aggregation "${aggName}" must be an object`,
          path: [...path, aggName],
        })
        continue
      }

      // 验证聚合类型
      const aggType = Object.keys(aggValue)[0]
      if (!this.isValidAggregationType(aggType)) {
        errors.push({
          severity: Severity.Error,
          message: `Unknown aggregation type: "${aggType}"`,
          path: [...path, aggName, aggType],
        })
        continue
      }

      // 验证聚合配置
      this.validateAggregationConfig(aggType, aggValue[aggType], errors, [...path, aggName, aggType])
    }
  }

  /**
   * 检查是否是有效的聚合类型
   */
  isValidAggregationType(type) {
    const validTypes = [
      'avg', 'max', 'min', 'sum', 'stats', 'extended_stats', 'cardinality',
      'value_count', 'percentiles', 'percentile_ranks', 'terms', 'filter',
      'filters', 'range', 'date_range', 'ip_range', 'histogram', 'date_histogram',
      'geo_bounds', 'geo_centroid', 'nested', 'reverse_nested', 'top_hits',
      'bucket_sort', 'composite', 'significant_terms', 'significant_text',
      'sampler', 'diversified_sampler',
    ]
    return validTypes.includes(type)
  }

  /**
   * 验证聚合配置
   */
  validateAggregationConfig(aggType, config, errors, path) {
    if (typeof config !== 'object' || config === null) {
      errors.push({
        severity: Severity.Error,
        message: `Aggregation config for "${aggType}" must be an object`,
        path,
      })
      return
    }

    // 大多数聚合都需要 field 属性
    if (
      !['filter', 'filters', 'multi_terms', 'diversified_sampler'].includes(aggType)
    ) {
      if (!config.field) {
        errors.push({
          severity: Severity.Warning,
          message: `"${aggType}" aggregation typically requires a "field" property`,
          path,
        })
      } else if (this.currentFields && !this.currentFields[config.field]) {
        errors.push({
          severity: Severity.Warning,
          message: `Field "${config.field}" not found in mapping`,
          path: [...path, 'field'],
        })
      }
    }

    // 特定聚合类型的验证
    switch (aggType) {
      case 'date_histogram':
        if (!config.calendar_interval && !config.fixed_interval) {
          errors.push({
            severity: Severity.Warning,
            message: 'date_histogram should have calendar_interval or fixed_interval',
            path,
          })
        }
        break

      case 'histogram':
        if (!config.interval) {
          errors.push({
            severity: Severity.Warning,
            message: 'histogram requires "interval" property',
            path,
          })
        }
        break
    }

    // 验证嵌套聚合
    if (config.aggs || config.aggregations) {
      const nestedAggs = config.aggs || config.aggregations
      this.validateAggregations(nestedAggs, errors, path)
    }
  }

  /**
   * 验证 sort
   */
  validateSort(sort, errors, path) {
    if (Array.isArray(sort)) {
      sort.forEach((sortItem, index) => {
        if (typeof sortItem === 'string') {
          // 简单排序字段
          if (
            !this.currentFields[sortItem] &&
            !['_score', '_doc'].includes(sortItem)
          ) {
            errors.push({
              severity: Severity.Warning,
              message: `Sort field "${sortItem}" not found in mapping`,
              path: [...path, index],
            })
          }
        } else if (typeof sortItem === 'object') {
          // 复杂排序配置
          for (const fieldName in sortItem) {
            if (
              !this.currentFields[fieldName] &&
              !['_score', '_doc'].includes(fieldName)
            ) {
              errors.push({
                severity: Severity.Warning,
                message: `Sort field "${fieldName}" not found in mapping`,
                path: [...path, index, fieldName],
              })
            }

            // 验证排序方向
            const order = sortItem[fieldName]
            if (typeof order === 'object' && order.order) {
              if (!['asc', 'desc'].includes(order.order)) {
                errors.push({
                  severity: Severity.Error,
                  message: `Sort order must be "asc" or "desc", got "${order.order}"`,
                  path: [...path, index, fieldName, 'order'],
                })
              }
            }
          }
        }
      })
    }
  }

  /**
   * 验证其他常见字段
   */
  validateCommonFields(query, errors) {
    // 验证 size
    if (query.size !== undefined) {
      if (!Number.isInteger(query.size) || query.size < 0) {
        errors.push({
          severity: Severity.Warning,
          message: 'size must be a non-negative integer',
        })
      } else if (query.size > 10000) {
        errors.push({
          severity: Severity.Info,
          message: 'Large size value may impact performance. Consider using pagination.',
        })
      }
    }

    // 验证 from
    if (query.from !== undefined) {
      if (!Number.isInteger(query.from) || query.from < 0) {
        errors.push({
          severity: Severity.Warning,
          message: 'from must be a non-negative integer',
        })
      }
    }

    // 验证 from + size 组合
    if (
      Number.isInteger(query.from) &&
      Number.isInteger(query.size) &&
      query.from + query.size > 10000
    ) {
      errors.push({
        severity: Severity.Info,
        message: 'from + size exceeds 10000. Consider using search_after for deep pagination.',
      })
    }
  }
}

/**
 * Monaco Diagnostics Provider 实现
 */
class ESDiagnosticsProvider {
  constructor() {
    this.validator = new ESValidator()
    this.modelMarkers = new Map() // 存储 marker，避免重复添加
    this.debounceTimer = null
  }

  /**
   * 更新当前字段
   */
  updateFields(fields) {
    this.validator.updateFields(fields)
  }

  /**
   * 验证 DSL 并在 Monaco 中显示错误
   * @param {monaco.editor.ITextModel} model Monaco 编辑器模型
   * @param {string} indexName 索引名称
   * @param {Object} fields 字段映射
   */
  validate(model, indexName, fields) {
    // 清除之前的 markers
    monaco.editor.setModelMarkers(model, 'es-dsl', [])

    // 更新字段
    this.updateFields(fields)

    // 验证 DSL
    const dslText = model.getValue()
    const errors = this.validator.validate(dslText)

    // 转换为 Monaco markers
    const markers = errors.map(error => ({
      severity: error.severity,
      message: error.message,
      startLineNumber: error.startLineNumber || 1,
      startColumn: error.startColumn || 1,
      endLineNumber: error.endLineNumber || error.startLineNumber || 1,
      endColumn: error.endColumn || error.startColumn || 1,
    }))

    // 添加 markers 到模型
    monaco.editor.setModelMarkers(model, 'es-dsl', markers)

    return markers
  }

  /**
   * 防抖验证
   * @param {monaco.editor.ITextModel} model Monaco 编辑器模型
   * @param {string} indexName 索引名称
   * @param {Object} fields 字段映射
   * @param {number} delay 延迟时间（毫秒）
   */
  validateDebounced(model, indexName, fields, delay = 500) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.validate(model, indexName, fields)
    }, delay)
  }
}

// 导出
export { ESDiagnosticsProvider, ESValidator, Severity }
