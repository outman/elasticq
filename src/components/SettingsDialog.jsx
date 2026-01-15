import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { load } from '@tauri-apps/plugin-store'

const STORE_PATH = 'settings.json'

export function SettingsDialog({ open, onOpenChange }) {
  const [url, setUrl] = useState('http://localhost:9200')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Load settings when dialog opens
  useEffect(() => {
    if (open) {
      loadSettings()
    }
  }, [open])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const store = await load(STORE_PATH)
      const savedUrl = await store.get('url')
      const savedUsername = await store.get('username')
      const savedPassword = await store.get('password')

      if (savedUrl) setUrl(savedUrl)
      if (savedUsername) setUsername(savedUsername)
      if (savedPassword) setPassword(savedPassword)
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const store = await load(STORE_PATH)
      await store.set('url', url)
      await store.set('username', username)
      await store.set('password', password)
      await store.save()

      // Trigger a custom event to notify parent component
      window.dispatchEvent(new CustomEvent('settings-saved', { detail: { url, username, password } }))
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Elasticsearch Settings</DialogTitle>
          <DialogDescription>
            Configure your Elasticsearch connection settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="url" className="text-right">
              URL
            </Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="col-span-3"
              placeholder="http://localhost:9200"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="col-span-3"
              placeholder="elastic"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="col-span-3"
              placeholder="••••••••"
              disabled={isLoading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
