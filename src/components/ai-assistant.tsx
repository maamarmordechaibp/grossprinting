'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, X, Send, Loader2, Sparkles, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Summarise today\'s production',
  'What needs attention now?',
  'Show all urgent orders',
  'Which stage is the bottleneck?',
  'What\'s this week\'s revenue?',
  'List low stock items',
]

function renderMessage(text: string) {
  // Simple markdown: **bold**, bullet lists, line breaks
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const isBullet = /^[-•*]\s/.test(line)
    const trimmed = isBullet ? line.replace(/^[-•*]\s/, '') : line

    // Bold: **text**
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/)
    const rendered = parts.map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    )

    if (isBullet) {
      return <div key={i} className="flex gap-2 mt-1"><span className="mt-0.5 text-primary shrink-0">•</span><span>{rendered}</span></div>
    }
    if (line.trim() === '') return <div key={i} className="h-2" />
    return <div key={i} className={i > 0 ? 'mt-1' : ''}>{rendered}</div>
  })
}

export function AiAssistant() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    const userMsg: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setThinking(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data = await res.json() as { content?: string; error?: string }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content ?? data.error ?? 'Something went wrong.',
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }])
    } finally {
      setThinking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, thinking])

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200',
          open
            ? 'bg-foreground text-background scale-95'
            : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-xl',
        )}
        aria-label="Toggle AI assistant"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] flex flex-col rounded-2xl border bg-card shadow-2xl transition-all duration-200 origin-bottom-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">AI Operations Assistant</p>
            <p className="text-[11px] text-muted-foreground">Powered by GPT-4o</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 max-h-[400px]">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center pt-2">
                Ask me anything about your operations.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs bg-muted/60 hover:bg-accent rounded-lg px-3 py-2 transition-colors text-muted-foreground hover:text-foreground leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {m.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  )}
                >
                  {m.role === 'assistant' ? renderMessage(m.content) : m.content}
                </div>
              </div>
            ))
          )}

          {thinking && (
            <div className="flex justify-start">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t px-3 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about orders, production, revenue…"
              rows={1}
              className="flex-1 resize-none bg-muted/40 rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition max-h-28 leading-relaxed"
              style={{ minHeight: '38px' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || thinking}
              className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  )
}
