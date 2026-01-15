/**
 * Elasticsearch Mapping Service
 * 负责获取、缓存和管理 Elasticsearch 索引的 mapping 信息
 */

// Tauri fetch 将在外部设置
let taуриFetch = null

/**
 * 设置 Tauri fetch 函数
 * @param {Function} fetchFunction Tauri 的 fetch 函数
 */
export function setTauriFetch(fetchFunction) {
  taуриFetch = fetchFunction
}

/**
 * 获取 fetch 函数（优先使用 Tauri fetch）
 */
function getFetch() {
  return taуриFetch || window.fetch
}

/**
 * 防抖函数
 * @param {Function} func 要防抖的函数
 * @param {number} wait 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * LRU 缓存实现
 * 限制缓存大小，避免内存占用过大
 */
class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    if (!this.cache.has(key)) return undefined
    // 移动到最后（最近使用）
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key, value) {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // 如果超出最大大小，删除最旧的
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  has(key) {
    return this.cache.has(key)
  }

  clear() {
    this.cache.clear()
  }

  get size() {
    return this.cache.size
  }

  get keys() {
    return Array.from(this.cache.keys())
  }
}

/**
 * Mapping 解析器
 * 负责解析 Elasticsearch mapping 响应
 */
class MappingParser {
  /**
   * 解析 Elasticsearch mapping 响应
   * @param {Object} mappingData Elasticsearch 返回的 mapping 数据
   * @returns {Object} 解析后的字段信息
   */
  parse(mappingData) {
    const fields = {}

    // 处理空数据或无效数据
    if (!mappingData || typeof mappingData !== 'object') {
      console.warn('[MappingParser] Invalid mapping data:', mappingData)
      return fields
    }

    // 遍历所有索引的 mapping
    for (const indexName in mappingData) {
      const indexData = mappingData[indexName]

      // 检查是否有 mappings 属性
      if (!indexData || !indexData.mappings) {
        console.warn(`[MappingParser] No mappings found for index: ${indexName}`)
        continue
      }

      const indexMapping = indexData.mappings

      // 处理不同版本的 mapping 结构
      const properties = indexMapping.properties || this.extractPropertiesFromLegacy(indexMapping)

      // 递归解析字段
      if (properties && typeof properties === 'object') {
        this.parseProperties(properties, fields, '')
      }
    }

    return fields
  }

  /**
   * 提取旧版本的 properties
   */
  extractPropertiesFromLegacy(mapping) {
    // 某些旧版本可能有不同的结构
    if (mapping.properties) return mapping.properties
    return {}
  }

  /**
   * 递归解析字段属性
   * @param {Object} properties 字段属性对象
   * @param {Object} fields 存储结果的字段对象
   * @param {string} prefix 当前路径前缀
   */
  parseProperties(properties, fields, prefix) {
    if (!properties) return

    for (const fieldName in properties) {
      const field = properties[fieldName]
      const fullPath = prefix ? `${prefix}.${fieldName}` : fieldName

      // 存储字段信息
      fields[fullPath] = {
        type: field.type || 'object',
        // 可选的元数据
        analyzer: field.analyzer,
        search_analyzer: field.search_analyzer,
        normalizer: field.normalizer,
        format: field.format, // 用于 date 类型
        // 子字段信息
        isNested: field.type === 'nested',
        hasProperties: !!field.properties,
        // multi-fields
        multiFields: field.fields ? Object.keys(field.fields) : [],
      }

      // 递归处理嵌套对象字段
      if (field.properties) {
        this.parseProperties(field.properties, fields, fullPath)
      }

      // 处理 multi-fields（如 keyword 字段的 .keyword 子字段）
      if (field.fields) {
        for (const multiFieldName in field.fields) {
          const multiField = field.fields[multiFieldName]
          fields[`${fullPath}.${multiFieldName}`] = {
            type: multiField.type,
            isMultiField: true,
            parentField: fullPath,
          }
        }
      }
    }
  }

  /**
   * 获取字段的类型信息
   * @param {Object} fields 字段集合
   * @param {string} fieldName 字段名
   * @returns {Object|null} 字段信息
   */
  getFieldType(fields, fieldName) {
    // 精确匹配
    if (fields[fieldName]) {
      return fields[fieldName]
    }

    // 尝试匹配嵌套字段路径
    const parts = fieldName.split('.')
    for (let i = parts.length; i > 0; i--) {
      const path = parts.slice(0, i).join('.')
      if (fields[path]) {
        return fields[path]
      }
    }

    return null
  }
}

/**
 * 字段值建议生成器
 * 根据字段类型提供智能补全建议
 */
class ValueSuggestionGenerator {
  /**
   * 获取字段值建议
   * @param {Object} field 字段信息
   * @param {string} context 上下文（range, term 等）
   * @returns {Array} 建议列表
   */
  getSuggestions(field, context = '') {
    if (!field) return []

    const suggestions = []

    switch (field.type) {
      case 'boolean':
        suggestions.push(
          { label: 'true', detail: 'Boolean true' },
          { label: 'false', detail: 'Boolean false' }
        )
        break

      case 'date':
        suggestions.push(
          ...this.getDateSuggestions(field.format)
        )
        break

      case 'integer':
      case 'long':
      case 'short':
      case 'byte':
        if (context === 'range') {
          suggestions.push(...this.getRangeOperatorSuggestions('integer'))
        }
        break

      case 'float':
      case 'double':
      case 'scaled_float':
        if (context === 'range') {
          suggestions.push(...this.getRangeOperatorSuggestions('float'))
        }
        break

      case 'ip':
        suggestions.push(
          { label: '192.168.0.0/16', detail: 'IP range' },
          { label: '10.0.0.0/8', detail: 'IP range' }
        )
        break

      case 'geo_point':
        suggestions.push(
          { label: '"lat": 40.73, "lon": -73.98', detail: 'Geo coordinate' }
        )
        break
    }

    return suggestions
  }

  /**
   * 获取日期类型的建议
   */
  getDateSuggestions(format) {
    const dateExpressions = [
      { label: 'now', detail: 'Current time' },
      { label: 'now-1d', detail: 'One day ago' },
      { label: 'now-7d', detail: 'Seven days ago' },
      { label: 'now-30d', detail: 'Thirty days ago' },
      { label: 'now-1M', detail: 'One month ago' },
      { label: 'now-1y', detail: 'One year ago' },
      { label: 'now/d', detail: 'Rounded to day' },
      { label: 'now-1d/d', detail: 'Yesterday rounded to day' },
    ]

    // 根据格式添加示例
    const formatExamples = {
      'strict_date_optional_time': { label: '2024-01-15T10:30:00Z', detail: 'ISO 8601 format' },
      'epoch_millis': { label: Date.now().toString(), detail: 'Epoch milliseconds' },
      'epoch_second': { label: Math.floor(Date.now() / 1000).toString(), detail: 'Epoch seconds' },
    }

    if (formatExamples[format]) {
      dateExpressions.unshift(formatExamples[format])
    }

    return dateExpressions
  }

  /**
   * 获取范围操作符建议
   */
  getRangeOperatorSuggestions(numberType) {
    return [
      { label: 'gte', detail: 'Greater than or equal' },
      { label: 'gt', detail: 'Greater than' },
      { label: 'lte', detail: 'Less than or equal' },
      { label: 'lt', detail: 'Less than' },
    ]
  }
}

/**
 * Elasticsearch Mapping Service 主类
 */
class ESMappingService {
  constructor() {
    // 使用 LRU 缓存，最多缓存 50 个索引的 mapping
    this.cache = new LRUCache(50)
    this.parser = new MappingParser()
    this.valueGenerator = new ValueSuggestionGenerator()

    // 防抖的 fetch 函数（300ms）
    this.debouncedFetch = debounce(this._fetchMapping.bind(this), 300)

    // 正在加载的请求（避免重复请求）
    this.pendingRequests = new Map()

    // 统计信息
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      fetchCount: 0,
    }
  }

  /**
   * 获取索引的 mapping（带缓存）
   * @param {string} elasticsearchUrl ES 地址
   * @param {string} indexName 索引名称
   * @param {Object} headers HTTP 请求头
   * @returns {Promise<Object>} 字段信息
   */
  async fetchMapping(elasticsearchUrl, indexName, headers) {
    // 检查缓存
    const cacheKey = `${elasticsearchUrl}#${indexName}`
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++
      return this.cache.get(cacheKey)
    }

    this.stats.cacheMisses++

    // 检查是否有正在进行的请求
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)
    }

    // 创建新的请求 promise
    const requestPromise = this.debouncedFetch(elasticsearchUrl, indexName, headers, cacheKey)
    this.pendingRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      return result
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  /**
   * 内部 fetch 实现
   */
  async _fetchMapping(elasticsearchUrl, indexName, headers, cacheKey) {
    try {
      this.stats.fetchCount++

      // 获取多个索引的 mapping，支持通配符
      const url = `${elasticsearchUrl}/${indexName}/_mapping`
      console.log(`[ESMappingService] Fetching: ${url}`)

      const fetchFn = getFetch()
      const response = await fetchFn(url, {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch mapping: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log(`[ESMappingService] Raw mapping data for ${indexName}:`, data)

      // 解析 mapping
      const fields = this.parser.parse(data)
      console.log(`[ESMappingService] Parsed ${Object.keys(fields).length} fields`)

      // 缓存结果
      this.cache.set(cacheKey, fields)

      return fields
    } catch (error) {
      console.error(`[ESMappingService] Error fetching mapping for ${indexName}:`, error)
      // 返回空对象而不是抛出错误，让应用继续运行
      return {}
    }
  }

  /**
   * 批量获取多个索引的 mapping
   * @param {string} elasticsearchUrl ES 地址
   * @param {Array<string>} indexNames 索引名称数组
   * @param {Object} headers HTTP 请求头
   * @returns {Promise<Object>} 合并后的字段信息
   */
  async fetchMultipleMappings(elasticsearchUrl, indexNames, headers) {
    if (indexNames.length === 0) return {}

    // 使用单个请求获取所有索引的 mapping
    const indexPattern = indexNames.join(',')
    return this.fetchMapping(elasticsearchUrl, indexPattern, headers)
  }

  /**
   * 预加载常用索引的 mapping
   * @param {string} elasticsearchUrl ES 地址
   * @param {Array<string>} indexNames 索引名称数组
   * @param {Object} headers HTTP 请求头
   */
  async preloadMappings(elasticsearchUrl, indexNames, headers) {
    const promises = indexNames.map(indexName =>
      this.fetchMapping(elasticsearchUrl, indexName, headers)
        .catch(err => console.warn(`Failed to preload mapping for ${indexName}:`, err))
    )

    await Promise.all(promises)
  }

  /**
   * 获取字段值建议
   * @param {string} elasticsearchUrl ES 地址
   * @param {string} indexName 索引名称
   * @param {string} fieldName 字段名
   * @param {string} context 上下文
   * @param {Object} headers HTTP 请求头
   * @returns {Promise<Array>} 建议列表
   */
  async getValueSuggestions(elasticsearchUrl, indexName, fieldName, context, headers) {
    const fields = await this.fetchMapping(elasticsearchUrl, indexName, headers)
    const field = this.parser.getFieldType(fields, fieldName)
    return this.valueGenerator.getSuggestions(field, context)
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear()
    this.pendingRequests.clear()
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      fetchCount: 0,
    }
  }

  /**
   * 清除特定索引的缓存
   * @param {string} elasticsearchUrl ES 地址
   * @param {string} indexName 索引名称
   */
  clearIndexCache(elasticsearchUrl, indexName) {
    const cacheKey = `${elasticsearchUrl}#${indexName}`
    this.cache.delete(cacheKey)
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
    }
  }

  /**
   * 获取所有缓存的索引
   */
  getCachedIndices() {
    return this.cache.keys.map(key => key.split('#')[1])
  }
}

// 导出单例
export const esMappingService = new ESMappingService()
export { ESMappingService, LRUCache, MappingParser, ValueSuggestionGenerator }
