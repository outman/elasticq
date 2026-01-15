/**
 * Elasticsearch DSL Completion Provider
 * 提供智能补全、语法高亮、查询模板等功能
 */

import * as monaco from 'monaco-editor'
import { getDSLContext } from '@/lib/esDSLParser'

/**
 * Elasticsearch DSL 关键字和语法定义
 */
const ES_DSL_KEYWORDS = {
  // Query clauses - 查询子句
  queries: [
    { name: 'match', detail: 'Full-text search', doc: 'Standard full-text query' },
    { name: 'match_phrase', detail: 'Phrase search', doc: 'Match the exact phrase' },
    { name: 'match_phrase_prefix', detail: 'Prefix phrase search', doc: 'Match phrases with prefix' },
    { name: 'match_bool_prefix', detail: 'Boolean prefix search', doc: 'Creates a bool query from prefix' },
    { name: 'multi_match', detail: 'Multi-field search', doc: 'Search across multiple fields' },
    { name: 'combined_fields', detail: 'Combined fields search', doc: 'Search multiple fields as one' },
    { name: 'bool', detail: 'Boolean query', doc: 'Combines multiple queries' },
    { name: 'boosting', detail: 'Boosting query', doc: 'Boost positive/negative results' },
    { name: 'dis_max', detail: 'Disjunction max', doc: 'Returns best matching query' },
    { name: 'constant_score', detail: 'Constant score', doc: 'Filter query with constant score' },
    { name: 'function_score', detail: 'Function score', doc: 'Score with custom functions' },
    { name: 'script_score', detail: 'Script score', doc: 'Score with custom script' },
    { name: 'exists', detail: 'Field exists', doc: 'Find documents with field' },
    { name: 'ids', detail: 'IDs query', doc: 'Query by document IDs' },
    { name: 'prefix', detail: 'Prefix query', doc: 'Find documents with prefix' },
    { name: 'range', detail: 'Range query', doc: 'Find documents in range' },
    { name: 'regexp', detail: 'Regexp query', doc: 'Regexp pattern matching' },
    { name: 'wildcard', detail: 'Wildcard query', doc: 'Wildcard pattern matching' },
    { name: 'fuzzy', detail: 'Fuzzy query', doc: 'Fuzzy matching' },
    { name: 'type', detail: 'Type query', doc: 'Query by document type' },
    { name: 'terms', detail: 'Terms query', doc: 'Multiple exact values' },
    { name: 'terms_set', detail: 'Terms set query', doc: 'Minimum matching terms' },
    { name: 'term', detail: 'Term query', doc: 'Exact value match' },
    { name: 'nested', detail: 'Nested query', doc: 'Query nested objects' },
    { name: 'has_child', detail: 'Has child', doc: 'Query with child documents' },
    { name: 'has_parent', detail: 'Has parent', doc: 'Query with parent documents' },
    { name: 'parent_id', detail: 'Parent ID', doc: 'Query by parent ID' },
    { name: 'percolate', detail: 'Percolate query', doc: 'Percolate query' },
    { name: 'rank_feature', detail: 'Rank feature', doc: 'Rank feature query' },
    { name: 'distance_feature', detail: 'Distance feature', doc: 'Distance feature query' },
    { name: 'geo_bounding_box', detail: 'Geo bounding box', doc: 'Geo bounding box query' },
    { name: 'geo_distance', detail: 'Geo distance', doc: 'Geo distance query' },
    { name: 'geo_polygon', detail: 'Geo polygon', doc: 'Geo polygon query' },
    { name: 'geo_shape', detail: 'Geo shape', doc: 'Geo shape query' },
    { name: 'interval', detail: 'Interval query', doc: 'Interval query' },
    { name: 'more_like_this', detail: 'More like this', doc: 'Find similar documents' },
    { name: 'script', detail: 'Script query', doc: 'Script-based query' },
    { name: 'simple_query_string', detail: 'Simple query string', doc: 'Simple query parser' },
    { name: 'query_string', detail: 'Query string', doc: 'Query string parser' },
    { name: 'span_term', detail: 'Span term', doc: 'Span term query' },
    { name: 'span_multi', detail: 'Span multi', doc: 'Span multiple queries' },
    { name: 'span_first', detail: 'Span first', doc: 'Span first query' },
    { name: 'span_near', detail: 'Span near', doc: 'Span near query' },
    { name: 'span_or', detail: 'Span or', doc: 'Span or query' },
    { name: 'span_not', detail: 'Span not', doc: 'Span not query' },
    { name: 'span_containing', detail: 'Span containing', doc: 'Span containing query' },
    { name: 'span_within', detail: 'Span within', doc: 'Span within query' },
    { name: 'span_field_masking', detail: 'Span field masking', doc: 'Span field masking' },
  ],

  // Bool query sub-clauses - 布尔查询子句
  boolClauses: [
    { name: 'must', detail: 'Must match', doc: 'Clauses that must match' },
    { name: 'filter', detail: 'Filter', doc: 'Clauses to filter (no scoring)' },
    { name: 'should', detail: 'Should match', doc: 'Clauses that should match' },
    { name: 'must_not', detail: 'Must not match', doc: 'Clauses that must not match' },
  ],

  // Aggregations - 聚合
  aggregations: [
    { name: 'avg', detail: 'Average', doc: 'Average aggregation' },
    { name: 'max', detail: 'Maximum', doc: 'Maximum value aggregation' },
    { name: 'min', detail: 'Minimum', doc: 'Minimum value aggregation' },
    { name: 'sum', detail: 'Sum', doc: 'Sum aggregation' },
    { name: 'stats', detail: 'Statistics', doc: 'Basic statistics' },
    { name: 'extended_stats', detail: 'Extended stats', doc: 'Extended statistics' },
    { name: 'cardinality', detail: 'Cardinality', doc: 'Unique count' },
    { name: 'value_count', detail: 'Value count', doc: 'Count values' },
    { name: 'percentiles', detail: 'Percentiles', doc: 'Percentile ranks' },
    { name: 'percentile_ranks', detail: 'Percentile ranks', doc: 'Percentile ranks' },
    { name: 'terms', detail: 'Terms aggregation', doc: 'Bucket by unique terms' },
    { name: 'filter', detail: 'Filter aggregation', doc: 'Filter documents' },
    { name: 'filters', detail: 'Filters aggregation', doc: 'Multiple filters' },
    { name: 'range', detail: 'Range aggregation', doc: 'Range buckets' },
    { name: 'date_range', detail: 'Date range', doc: 'Date range buckets' },
    { name: 'ip_range', detail: 'IP range', doc: 'IP range buckets' },
    { name: 'histogram', detail: 'Histogram', doc: 'Numeric histogram' },
    { name: 'date_histogram', detail: 'Date histogram', doc: 'Date histogram' },
    { name: 'geo_bounds', detail: 'Geo bounds', doc: 'Geo bounding box' },
    { name: 'geo_centroid', detail: 'Geo centroid', doc: 'Geo center point' },
    { name: 'nested', detail: 'Nested aggregation', doc: 'Nested object aggregation' },
    { name: 'reverse_nested', detail: 'Reverse nested', doc: 'Reverse nested aggregation' },
    { name: 'top_hits', detail: 'Top hits', doc: 'Top documents per bucket' },
    { name: 'bucket_sort', detail: 'Bucket sort', doc: 'Sort buckets' },
    { name: 'composite', detail: 'Composite', doc: 'Composite buckets' },
    { name: 'significant_terms', detail: 'Significant terms', doc: 'Unusual terms' },
    { name: 'significant_text', detail: 'Significant text', doc: 'Unusual text terms' },
    { name: 'sampler', detail: 'Sampler', doc: 'Reduce sample size' },
    { name: 'diversified_sampler', detail: 'Diversified sampler', doc: 'Diversified sample' },
  ],

  // Sort options - 排序选项
  sortOptions: [
    { name: '_score', detail: 'Relevance score' },
    { name: '_doc', detail: 'Document order' },
  ],

  // Common fields - 通用字段
  commonFields: [
    { name: 'query', detail: 'Query clause' },
    { name: 'aggs', detail: 'Aggregations', alternatives: ['aggregations'] },
    { name: 'sort', detail: 'Sort criteria' },
    { name: 'size', detail: 'Number of results' },
    { name: 'from', detail: 'Starting offset' },
    { name: 'timeout', detail: 'Request timeout' },
    { name: 'track_total_hits', detail: 'Track total hits' },
    { name: 'track_scores', detail: 'Track scores' },
    { name: 'min_score', detail: 'Minimum score' },
    { name: 'source', detail: 'Source filtering', alternatives: ['_source'] },
    { name: 'fields', detail: 'Field retrieval' },
    { name: 'script_fields', detail: 'Script fields' },
    { name: 'explain', detail: 'Explain scoring' },
    { name: 'profile', detail: 'Query profiling' },
    { name: 'highlight', detail: 'Highlight results' },
  ],

  // Range operators - 范围操作符
  rangeOperators: [
    { name: 'gte', detail: 'Greater than or equal', doc: 'Greater than or equal to' },
    { name: 'gt', detail: 'Greater than', doc: 'Greater than' },
    { name: 'lte', detail: 'Less than or equal', doc: 'Less than or equal to' },
    { name: 'lt', detail: 'Less than', doc: 'Less than' },
  ],

  // Match query options - match 查询选项
  matchOptions: [
    { name: 'query', detail: 'Query text' },
    { name: 'analyzer', detail: 'Analyzer' },
    { name: 'boost', detail: 'Boost value' },
    { name: 'operator', detail: 'Operator (and/or)', values: ['or', 'and'] },
    { name: 'minimum_should_match', detail: 'Minimum should match' },
    { name: 'fuzziness', detail: 'Fuzziness amount' },
    { name: 'prefix_length', detail: 'Prefix length' },
    { name: 'max_expansions', detail: 'Max expansions' },
  ],
}

/**
 * 查询模板定义
 */
const QUERY_TEMPLATES = {
  matchAll: {
    label: 'match_all',
    description: 'Match all documents',
    insertText: `{
  "query": {
    "match_all": {}
  }
}`,
    documentation: 'Returns all documents. Equivalent to no query.',
  },

  match: {
    label: 'match query',
    description: 'Full-text search',
    insertText: `{
  "query": {
    "match": {
      "\${1:field_name}": "\${2:search_text}"
    }
  }
}`,
    documentation: 'Standard full-text search query. Analyzes the search text and finds documents matching the terms.',
  },

  term: {
    label: 'term query',
    description: 'Exact value match',
    insertText: `{
  "query": {
    "term": {
      "\${1:field_name}": "\${2:value}"
    }
  }
}`,
    documentation: 'Finds documents that contain the exact value specified. Does not analyze the search value.',
  },

  range: {
    label: 'range query',
    description: 'Range query',
    insertText: `{
  "query": {
    "range": {
      "\${1:field_name}": {
        "gte": "\${2:min_value}",
        "lte": "\${3:max_value}"
      }
    }
  }
}`,
    documentation: 'Finds documents with fields in the specified range.',
  },

  bool: {
    label: 'bool query',
    description: 'Boolean combination',
    insertText: `{
  "query": {
    "bool": {
      "must": [
        { "match": { "\${1:field}": "\${2:value}" } }
      ],
      "filter": [
        { "term": { "\${3:field}": "\${4:value}" } }
      ],
      "should": [],
      "must_not": []
    }
  }
}`,
    documentation: 'Combines multiple query clauses using boolean logic.',
  },

  multi_match: {
    label: 'multi_match query',
    description: 'Search multiple fields',
    insertText: `{
  "query": {
    "multi_match": {
      "query": "\${1:search_text}",
      "fields": ["\${2:field1}", "\${3:field2}"]
    }
  }
}`,
    documentation: 'Searches across multiple fields with a single query string.',
  },

  exists: {
    label: 'exists query',
    description: 'Field exists',
    insertText: `{
  "query": {
    "exists": {
      "field": "\${1:field_name}"
    }
  }
}`,
    documentation: 'Returns documents that have a field with a non-null value.',
  },

  termsAggregation: {
    label: 'terms aggregation',
    description: 'Group by field values',
    insertText: `{
  "size": 0,
  "aggs": {
    "\${1:agg_name}": {
      "terms": {
        "field": "\${2:field_name}",
        "size": 10
      }
    }
  }
}`,
    documentation: 'Groups documents by unique field values and returns counts.',
  },

  dateHistogram: {
    label: 'date_histogram',
    description: 'Time series aggregation',
    insertText: `{
  "size": 0,
  "aggs": {
    "\${1:agg_name}": {
      "date_histogram": {
        "field": "\${2:date_field}",
        "calendar_interval": "\${3:day}"
      }
    }
  }
}`,
    documentation: 'Groups documents into time-based buckets for time series analysis.',
  },

  filterAggregation: {
    label: 'filter aggregation',
    description: 'Filter and aggregate',
    insertText: `{
  "size": 0,
  "aggs": {
    "\${1:agg_name}": {
      "filter": {
        "term": {
          "\${2:field}": "\${3:value}"
        }
      }
    }
  }
}`,
    documentation: 'Filters documents and computes metrics on the filtered subset.',
  },

  complexQuery: {
    label: 'complex query',
    description: 'Complex query with aggregations',
    insertText: `{
  "query": {
    "bool": {
      "must": [
        { "match": { "\${1:title}": "\${2:search}" } }
      ],
      "filter": [
        { "term": { "\${3:status}": "\${4:published}" } },
        { "range": { "\${5:date}": { "gte": "\${6:now-30d}" } } }
      ]
    }
  },
  "aggs": {
    "\${7:categories}": {
      "terms": { "field": "\${8:category}" }
    }
  },
  "sort": [
    { "\${9:date}": "desc" }
  ],
  "from": 0,
  "size": 10
}`,
    documentation: 'Complex query combining boolean queries, filters, aggregations, and sorting.',
  },
}

/**
 * Monaco Completion Provider 实现
 */
class ESCompletionProvider {
  constructor() {
    this.currentFields = {}
    this.currentUrl = ''
    this.currentIndex = ''
    this.headers = null
    this.mappingService = null

    // 用于触发字符
    this.triggerCharacters = ['"', ':', '{', '[', ' ', '.', '"', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
  }

  /**
   * 更新当前上下文
   */
  updateContext(url, index, headers, fields) {
    this.currentUrl = url
    this.currentIndex = index
    this.headers = headers
    this.currentFields = fields || {}
  }

  /**
   * Monaco completion provider 接口
   */
  provideCompletionItems(model, position, context, token) {
    const suggestions = []

    // 获取完整代码和偏移量
    const code = model.getValue()
    const offset = model.getOffsetAt(position)

    // 获取当前行内容
    const lineContent = model.getLineContent(position.lineNumber)
    const lineUntilPosition = lineContent.substring(0, position.column - 1)

    // 手动获取当前输入的词（支持 JSON 格式，包括引号和下划线）
    const currentWord = this.extractCurrentWord(lineUntilPosition)
    const wordRange = this.getWordRange(lineUntilPosition, position)

    // 使用 DSL 解析器获取上下文（不包含当前正在输入的词）
    const codeBeforeWord = code.substring(0, offset - currentWord.length)
    const dslContext = getDSLContext(codeBeforeWord, offset - currentWord.length)

    console.log('[Completion] Context:', {
      currentWord,
      wordRange,
      dslContext,
      line: lineContent,
      lineUntil: lineUntilPosition,
    })

    // 根据上下文和期待的内容类型提供建议
    if (dslContext.expecting === 'key') {
      // 期待键名
      suggestions.push(...this.getKeySuggestions(dslContext))
    } else if (dslContext.expecting === 'value') {
      // 期待值
      suggestions.push(...this.getValueSuggestions(dslContext))
    }

    // 如果在顶层或内容很少，也提供模板
    const textBefore = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })

    if (textBefore.trim().length < 50) {
      suggestions.push(...this.getTemplateSuggestions())
    }

    // 过滤掉不匹配当前输入的建议
    const filteredSuggestions = this.filterSuggestions(suggestions, currentWord)

    // 设置替换范围
    const result = {
      suggestions: filteredSuggestions.map(s => ({
        ...s,
        range: wordRange,
      })),
    }

    console.log('[Completion] Total:', result.suggestions.length)
    return result
  }

  /**
   * 提取当前正在输入的词
   */
  extractCurrentWord(lineUntilPosition) {
    // 匹配 JSON 中的词（包括引号内的内容）
    // 找最后一个 " 开始的词
    const lastQuoteIndex = lineUntilPosition.lastIndexOf('"')

    if (lastQuoteIndex === -1) {
      // 没有引号，匹配字母数字下划线
      const match = lineUntilPosition.match(/[\w_]+$/)
      return match ? match[0] : ''
    }

    // 检查引号是否闭合
    const afterQuote = lineUntilPosition.substring(lastQuoteIndex + 1)
    if (afterQuote.includes('"')) {
      // 引号已闭合，匹配后面的内容
      const match = afterQuote.match(/[\w_]+$/)
      return match ? match[0] : ''
    }

    // 引号未闭合，返回引号后的内容
    return afterQuote
  }

  /**
   * 获取当前词的范围
   */
  getWordRange(lineUntilPosition, position) {
    const currentWord = this.extractCurrentWord(lineUntilPosition)

    // 计算起始位置
    const startColumn = position.column - currentWord.length

    return {
      startLineNumber: position.lineNumber,
      startColumn: startColumn,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    }
  }

  /**
   * 根据当前输入过滤建议
   */
  filterSuggestions(suggestions, currentWord) {
    if (!currentWord) return suggestions

    const lowerWord = currentWord.toLowerCase()
    return suggestions.filter(s => {
      const label = typeof s.label === 'string' ? s.label : s.label.label
      return label.toLowerCase().startsWith(lowerWord)
    })
  }

  /**
   * 获取键建议（基于 DSL 上下文）
   */
  getKeySuggestions(dslContext) {
    const suggestions = []
    const { path, location, queryType, boolClause, depth } = dslContext

    console.log('[Key Suggestions] Context:', { path, location, queryType, depth })

    // 根据路径和位置提供建议
    if (depth === 0 || path.length === 0) {
      // 顶层字段
      suggestions.push(
        { label: 'query', kind: monaco.languages.CompletionItemKind.Property, detail: 'Query clause', insertText: '"query": {\n  $1\n}' },
        { label: 'aggs', kind: monaco.languages.CompletionItemKind.Property, detail: 'Aggregations', insertText: '"aggs": {\n  "$1": {}\n}' },
        { label: 'sort', kind: monaco.languages.CompletionItemKind.Property, detail: 'Sort criteria', insertText: '"sort": ' },
        { label: 'size', kind: monaco.languages.CompletionItemKind.Property, detail: 'Number of results', insertText: '"size": ' },
        { label: 'from', kind: monaco.languages.CompletionItemKind.Property, detail: 'Starting offset', insertText: '"from": ' },
        { label: '_source', kind: monaco.languages.CompletionItemKind.Property, detail: 'Source filtering', insertText: '"_source": ' },
      )
    } else if (location === 'query' && path.length === 1) {
      // query: { 这里，提供所有 query 类型
      suggestions.push(...this.getQueryTypeSuggestions())
    } else if (location === 'bool' && path.length === 2) {
      // bool: { 这里，提供 bool 子句
      suggestions.push(
        { label: 'must', kind: monaco.languages.CompletionItemKind.Property, detail: 'Must match', insertText: '"must": [\n  $1\n]' },
        { label: 'should', kind: monaco.languages.CompletionItemKind.Property, detail: 'Should match', insertText: '"should": [\n  $1\n]' },
        { label: 'filter', kind: monaco.languages.CompletionItemKind.Property, detail: 'Filter', insertText: '"filter": [\n  $1\n]' },
        { label: 'must_not', kind: monaco.languages.CompletionItemKind.Property, detail: 'Must not match', insertText: '"must_not": [\n  $1\n]' },
      )
    } else if (location === 'bool_clause') {
      // 在 bool 子句中，提供 query 类型
      suggestions.push(...this.getQueryTypeSuggestions())
    } else if (queryType) {
      // 在特定 query 类型中，提供字段名
      suggestions.push(...this.getFieldNameSuggestions())
    } else if (location === 'aggs') {
      // 在 aggs 中，提供聚合类型
      suggestions.push(...this.getAggregationSuggestions())
    }

    return suggestions
  }

  /**
   * 获取值建议（基于 DSL 上下文）
   */
  getValueSuggestions(dslContext) {
    const suggestions = []
    const { path, queryType, currentKey } = dslContext

    // 根据当前键和查询类型提供值建议
    if (currentKey === 'operator' && ['match', 'match_phrase'].includes(queryType)) {
      suggestions.push(
        { label: 'or', kind: monaco.languages.CompletionItemKind.Value },
        { label: 'and', kind: monaco.languages.CompletionItemKind.Value }
      )
    } else if (queryType === 'range' && currentKey) {
      // range query 的值
      if (!['gte', 'gt', 'lte', 'lt'].includes(currentKey)) {
        // 如果当前键不是 range 操作符，建议操作符
      }
    }

    // 根据字段类型提供建议
    if (currentKey && this.currentFields[currentKey]) {
      const field = this.currentFields[currentKey]
      suggestions.push(...this.getFieldValueSuggestions(field))
    }

    return suggestions
  }

  /**
   * 获取 query 类型建议
   */
  getQueryTypeSuggestions() {
    const queries = [
      { name: 'match', detail: 'Full-text search', snippet: '{"field": "query"}' },
      { name: 'term', detail: 'Exact value', snippet: '{"field": "value"}' },
      { name: 'terms', detail: 'Multiple values', snippet: '{"field": ["value1", "value2"]}' },
      { name: 'range', detail: 'Range query', snippet: '{"field": {"gte": "min", "lte": "max"}}' },
      { name: 'bool', detail: 'Boolean query', snippet: '{"must": [], "filter": [], "should": [], "must_not": []}' },
      { name: 'exists', detail: 'Field exists', snippet: '{"field": "field_name"}' },
      { name: 'match_phrase', detail: 'Phrase match', snippet: '{"field": "phrase"}' },
      { name: 'prefix', detail: 'Prefix match', snippet: '{"field": "prefix"}' },
      { name: 'wildcard', detail: 'Wildcard match', snippet: '{"field": "pattern"}' },
      { name: 'multi_match', detail: 'Multi-field search', snippet: '{"query": "text", "fields": ["field1", "field2"]}' },
      { name: 'nested', detail: 'Nested query', snippet: '{"path": "path", "query": {}}' },
      { name: 'function_score', detail: 'Function score', snippet: '{"query": {}, "functions": []}' },
      { name: 'dis_max', detail: 'Disjunction max', snippet: '{"queries": []}' },
    ]

    return queries.map(q => ({
      label: q.name,
      kind: monaco.languages.CompletionItemKind.Function,
      detail: q.detail,
      insertText: `"${q.name}": ${q.snippet}`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: q.detail,
    }))
  }

  /**
   * 获取字段名建议
   */
  getFieldNameSuggestions(queryType) {
    return Object.entries(this.currentFields).map(([name, info]) => ({
      label: name,
      kind: monaco.languages.CompletionItemKind.Property,
      detail: `${info.type}`,
      insertText: `"${name}": `,
      documentation: `Field of type ${info.type}`,
      sortText: `0_${name}`,
    }))
  }

  /**
   * 获取聚合建议
   */
  getAggregationSuggestions() {
    const aggs = [
      { name: 'terms', detail: 'Bucket by unique terms' },
      { name: 'avg', detail: 'Average' },
      { name: 'sum', detail: 'Sum' },
      { name: 'max', detail: 'Maximum' },
      { name: 'min', detail: 'Minimum' },
      { name: 'stats', detail: 'Statistics' },
      { name: 'extended_stats', detail: 'Extended statistics' },
      { name: 'cardinality', detail: 'Unique count' },
      { name: 'value_count', detail: 'Count values' },
      { name: 'filter', detail: 'Filter aggregation' },
      { name: 'filters', detail: 'Multiple filters' },
      { name: 'range', detail: 'Range buckets' },
      { name: 'date_range', detail: 'Date range buckets' },
      { name: 'date_histogram', detail: 'Date histogram' },
      { name: 'histogram', detail: 'Numeric histogram' },
      { name: 'nested', detail: 'Nested aggregation' },
      { name: 'reverse_nested', detail: 'Reverse nested' },
      { name: 'top_hits', detail: 'Top documents' },
    ]

    return aggs.map(a => ({
      label: a.name,
      kind: monaco.languages.CompletionItemKind.Function,
      detail: a.detail,
      insertText: `"${a.name}": {\n  "field": "$1"\n}`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    }))
  }

  /**
   * 获取查询模板建议
   */
  getTemplateSuggestions() {
    return Object.values(QUERY_TEMPLATES).map(template => ({
      label: template.label,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: template.description,
      insertText: template.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: template.documentation,
    }))
  }

  /**
   * 去重建议
   */
  deduplicateSuggestions(suggestions) {
    const seen = new Set()
    return suggestions.filter(s => {
      if (seen.has(s.label)) {
        return false
      }
      seen.add(s.label)
      return true
    })
  }
}

/**
 * Monaco Hover Provider 实现
 */
class ESHoverProvider {
  provideHover(model, position, token) {
    const word = model.getWordAtPosition(position)
    if (!word) return

    const wordText = word.word

    // 在关键字定义中查找
    const allKeywords = [
      ...ES_DSL_KEYWORDS.queries,
      ...ES_DSL_KEYWORDS.boolClauses,
      ...ES_DSL_KEYWORDS.aggregations,
      ...ES_DSL_KEYWORDS.rangeOperators,
      ...ES_DSL_KEYWORDS.commonFields,
    ]

    const keyword = allKeywords.find(k => k.name === wordText)
    if (keyword) {
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: [
          { value: `**${keyword.name}**` },
          { value: keyword.detail || '' },
          { value: keyword.doc || '' },
        ],
      }
    }

    return null
  }
}

// 导出
export { ESCompletionProvider, ESHoverProvider, ES_DSL_KEYWORDS, QUERY_TEMPLATES }
