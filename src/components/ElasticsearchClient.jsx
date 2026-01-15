import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import Editor, { loader } from '@monaco-editor/react'
import { Settings, Plug, Unplug, Play, Loader2, Database, AlertCircle } from 'lucide-react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { SettingsDialog } from '@/components/SettingsDialog'
import { load } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'
import { esMappingService, setTauriFetch } from '@/lib/esMappingService'
import { ESCompletionProvider, ESHoverProvider } from '@/lib/esCompletionProvider'
import { ESDiagnosticsProvider } from '@/lib/esDiagnosticsProvider'

const STORE_PATH = 'settings.json'

// Configure Monaco to use local workers
self.MonacoEnvironment = {
  getWorker(workerId, label) {
    if (label === 'json') {
      return new jsonWorker()
    }
    return new editorWorker()
  },
}

loader.config({ monaco })

export default function ElasticsearchClient() {
  const [elasticsearchUrl, setElasticsearchUrl] = useState('http://localhost:9200')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [dslQuery, setDslQuery] = useState(`{
  "query": {
    "match_all": {}
  }
}`)
  const [queryResult, setQueryResult] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState(null)
  const [indexName, setIndexName] = useState('*')
  const [availableIndices, setAvailableIndices] = useState([])
  const [currentFields, setCurrentFields] = useState({})
  const [isMappingLoading, setIsMappingLoading] = useState(false)

  // Refs for providers
  const completionProviderRef = useRef(null)
  const hoverProviderRef = useRef(null)
  const diagnosticsProviderRef = useRef(null)
  const editorModelRef = useRef(null)
  const monacoRef = useRef(null)

  // Load settings on mount
  useEffect(() => {
    // 设置 Tauri fetch 给 mapping service
    setTauriFetch(fetch)

    loadSettings()
    // Listen for settings saved event
    const handleSettingsSaved = (event) => {
      const { url, username: newUsername, password: newPassword } = event.detail
      if (url) setElasticsearchUrl(url)
      if (newUsername) setUsername(newUsername)
      if (newPassword) setPassword(newPassword)
    }

    window.addEventListener('settings-saved', handleSettingsSaved)
    return () => window.removeEventListener('settings-saved', handleSettingsSaved)
  }, [])

  const loadSettings = async () => {
    try {
      const store = await load(STORE_PATH)
      const savedUrl = await store.get('url')
      const savedUsername = await store.get('username')
      const savedPassword = await store.get('password')

      if (savedUrl) setElasticsearchUrl(savedUrl)
      if (savedUsername) setUsername(savedUsername)
      if (savedPassword) setPassword(savedPassword)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  // Helper function to create headers with authentication
  const createHeaders = (options = {}) => {
    const headers = {
      'User-Agent': 'curl/8.14.1',
      'Accept': '*/*',
    }
    if (options.method === 'POST' || options.method === 'PUT') {
      headers['Content-Type'] = 'application/json'
    }
    if (username && password) {
      const credentials = username + ':' + password
      const authValue = 'Basic ' + btoa(credentials)
      headers['Authorization'] = authValue
    }
    return headers
  }

  // Load index mapping with error handling
  const loadIndexMapping = useCallback(async (index) => {
    if (!isConnected || index === '*') {
      setCurrentFields({})
      return
    }

    setIsMappingLoading(true)
    try {
      console.log(`[Mapping] Fetching mapping for index: ${index}`)
      const fields = await esMappingService.fetchMapping(
        elasticsearchUrl,
        index,
        createHeaders()
      )

      // 确保 fields 是一个对象
      if (!fields || typeof fields !== 'object') {
        console.warn('[Mapping] Invalid fields data received:', fields)
        setCurrentFields({})
        return
      }

      setCurrentFields(fields)

      // 更新 completion provider 的上下文
      if (completionProviderRef.current) {
        completionProviderRef.current.updateContext(
          elasticsearchUrl,
          index,
          createHeaders(),
          fields
        )
      }

      // 更新 diagnostics provider
      if (diagnosticsProviderRef.current && editorModelRef.current) {
        diagnosticsProviderRef.current.updateFields(fields)
        diagnosticsProviderRef.current.validate(editorModelRef.current, index, fields)
      }

      const fieldCount = Object.keys(fields).length
      console.log(`[Mapping] Loaded ${fieldCount} fields for index: ${index}`)
    } catch (err) {
      console.warn('[Mapping] Failed to load mapping:', err)
      setCurrentFields({})
    } finally {
      setIsMappingLoading(false)
    }
  }, [isConnected, elasticsearchUrl, username, password])

  // Load mapping when index changes
  useEffect(() => {
    loadIndexMapping(indexName)
  }, [indexName, loadIndexMapping])

  // Test Elasticsearch connection by pinging the server
  const testConnection = async () => {
    const headers = createHeaders()
    const response = await fetch(`${elasticsearchUrl}/_cluster/health`, {
      method: 'GET',
      headers: headers,
    })

    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`Connection failed: ${response.status} ${response.statusText}\n${bodyText}`)
    }
    return await response.json()
  }

  // Fetch available indices from Elasticsearch
  const fetchIndices = async () => {
    const response = await fetch(`${elasticsearchUrl}/_cat/indices?format=json`, {
      method: 'GET',
      headers: createHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch indices: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return data.map(index => index.index)
  }

  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      setIsConnected(false)
      setAvailableIndices([])
      setQueryResult('')
      setError(null)
      setCurrentFields({})
      esMappingService.clearCache()
      return
    }

    // Connect
    setIsLoading(true)
    setError(null)

    try {
      // Test connection
      await testConnection()

      // Fetch indices
      const indices = await fetchIndices()
      setAvailableIndices(indices)

      setIsConnected(true)

      // Load mapping for first index
      if (indices.length > 0) {
        setIndexName(indices[0])
      }

      setQueryResult(JSON.stringify({
        status: 'connected',
        message: 'Successfully connected to Elasticsearch',
        cluster_info: {
          indices_count: indices.length,
          indices: indices
        }
      }, null, 2))
    } catch (err) {
      setError(err.message)
      setIsConnected(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExecuteQuery = async () => {
    if (!isConnected) {
      setError('Please connect to Elasticsearch first')
      return
    }

    setIsExecuting(true)
    setError(null)

    try {
      // Validate JSON
      let queryBody
      try {
        queryBody = JSON.parse(dslQuery)
      } catch (err) {
        throw new Error('Invalid JSON in query: ' + err.message)
      }

      // Execute search query using Tauri fetch
      const searchUrl = `${elasticsearchUrl}/${indexName}/_search`
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: createHeaders({ method: 'POST' }),
        body: JSON.stringify(queryBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Query failed: ${response.status} ${response.statusText}\n${errorText}`)
      }

      const result = await response.json()
      setQueryResult(JSON.stringify(result, null, 2))
    } catch (err) {
      setError(err.message)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b">
        {/* Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>

        {/* URL Input */}
        <Input
          type="url"
          value={elasticsearchUrl}
          onChange={(e) => setElasticsearchUrl(e.target.value)}
          placeholder="Elasticsearch URL"
          className="flex-1 max-w-md"
          disabled={isConnected}
        />

        {/* Connect/Disconnect Button */}
        <Button
          variant={isConnected ? "destructive" : "default"}
          size="icon"
          onClick={handleConnect}
          title={isConnected ? "Disconnect" : "Connect"}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isConnected ? (
            <Unplug className="h-5 w-5" />
          ) : (
            <Plug className="h-5 w-5" />
          )}
        </Button>

        {/* Connection Status */}
        {isConnected && (
          <div className="flex items-center gap-2 ml-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Connected</span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6"
            onClick={() => setError(null)}
          >
            Clear
          </Button>
        </div>
      )}

      {/* DSL Query Toolbar */}
      <div className="flex items-center justify-between px-3 h-10 bg-muted border-b shrink-0">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <span className="text-sm font-medium">DSL Query</span>
          {/* Index Selector */}
          {isConnected && (
            <select
              value={indexName}
              onChange={(e) => setIndexName(e.target.value)}
              className="ml-2 h-7 px-2 text-sm rounded border border-input bg-background"
            >
              <option value="*">All Indices (*)</option>
              {availableIndices.map((index) => (
                <option key={index} value={index}>
                  {index}
                </option>
              ))}
            </select>
          )}
          {/* Mapping Status */}
          {isConnected && indexName !== '*' && (
            <div className="flex items-center gap-1 ml-2 text-xs text-muted-foreground">
              {isMappingLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading mapping...</span>
                </>
              ) : Object.keys(currentFields).length > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>{Object.keys(currentFields).length} fields loaded</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>No mapping data</span>
                </>
              )}
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="default"
          onClick={handleExecuteQuery}
          disabled={!isConnected || isExecuting}
          title="Execute Query"
          className="h-8 w-8"
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Editors Section - Split Panel */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Request Editor Panel */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={dslQuery}
            onChange={(value) => setDslQuery(value || '')}
            theme="vs-dark"
            beforeMount={(monaco) => {
              // 注册 completion provider
              if (!completionProviderRef.current) {
                completionProviderRef.current = new ESCompletionProvider()
                monaco.languages.registerCompletionItemProvider('json', {
                  provideCompletionItems: (model, position, context, token) => {
                    return completionProviderRef.current.provideCompletionItems(
                      model, position, context, token
                    )
                  },
                  triggerCharacters: ['"', ':', '{', '[', ' ', '.'],
                })
              }

              // 注册 hover provider
              if (!hoverProviderRef.current) {
                hoverProviderRef.current = new ESHoverProvider()
                monaco.languages.registerHoverProvider('json', {
                  provideHover: (model, position, token) => {
                    return hoverProviderRef.current.provideHover(model, position, token)
                  },
                })
              }

              // 创建 diagnostics provider
              if (!diagnosticsProviderRef.current) {
                diagnosticsProviderRef.current = new ESDiagnosticsProvider()
              }

              monacoRef.current = monaco
            }}
            onMount={(editor, monaco) => {
              editorModelRef.current = editor.getModel()

              // 初始化时验证一次
              if (diagnosticsProviderRef.current && indexName !== '*') {
                diagnosticsProviderRef.current.validate(editor.getModel(), indexName, currentFields)
              }
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              parameterHints: { enabled: true },
              wordBasedSuggestions: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
              },
            }}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Response Editor Panel */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={queryResult}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
              },
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
