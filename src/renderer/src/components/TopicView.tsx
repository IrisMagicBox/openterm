import { useState, useEffect, useRef } from 'react'
import { Send, User, Bot, Server, Hash, ChevronDown, ChevronRight, Terminal as TerminalIcon, CheckCircle2 } from 'lucide-react'
import { Host, Topic, Message } from '../../../shared/types'

interface TopicViewProps {
  topic: Topic
  hosts: Host[]
}

export function TopicView({ topic, hosts }: TopicViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filtered hosts for @ mentions
  const filteredHosts = hosts.filter(h => 
    h.alias.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    h.ip.includes(mentionFilter)
  )

  useEffect(() => {
    // Initial scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    const lastWord = value.split(' ').pop() || ''

    if (lastWord.startsWith('@')) {
      setShowMentions(true)
      setMentionFilter(lastWord.slice(1))
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (host: Host) => {
    const pixels = inputValue.split(' ')
    pixels.pop() // remove @part
    setInputValue([...pixels, `@${host.alias} `].join(' '))
    setShowMentions(false)
  }

  const handleSend = async () => {
    if (!inputValue.trim() || isThinking) return
    
    const userContent = inputValue
    const userMsg: Message = {
      id: Date.now().toString(),
      topicId: topic.id,
      role: 'user',
      content: userContent,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsThinking(true)
    
    try {
      const response = await window.api.sendMessage(topic.id, userContent)
      setMessages(prev => [...prev, response])
    } catch (err) {
      console.error('Agent error:', err)
    } finally {
      setIsThinking(false)
    }
  }

  const toggleThought = (msgId: string) => {
    setExpandedThoughts(prev => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8">
        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto space-y-4">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <Bot size={32} />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">Start an OpenTerm Conversation</h3>
                    <p className="text-sm text-gray-500 mt-1">Ask me to coordinate across your hosts. Use @ to target specific machines.</p>
                </div>
            </div>
        )}
        
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
              <div className={`p-2 rounded-xl flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100 text-gray-600'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="flex flex-col space-y-3">
                {/* Agent Thought */}
                {msg.thought && (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2 text-xs text-gray-500 overflow-hidden shadow-sm">
                    <button 
                       onClick={() => toggleThought(msg.id)}
                       className="flex items-center font-bold tracking-tight uppercase text-[10px] text-gray-400 hover:text-gray-600 transition mb-1"
                    >
                      {expandedThoughts[msg.id] ? <ChevronDown size={12} className="mr-1" /> : <ChevronRight size={12} className="mr-1" />}
                      Agent Thought
                    </button>
                    {expandedThoughts[msg.id] && <div className="mt-2 text-gray-600 leading-relaxed italic border-l-2 border-gray-200 pl-3 py-1">{msg.thought}</div>}
                  </div>
                )}

                {/* Tool Calls */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    {msg.toolCalls.map(tool => (
                      <div key={tool.id} className="flex items-center text-[11px] font-medium text-blue-600 bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-xl shadow-sm">
                        <TerminalIcon size={12} className="mr-2" />
                        Executing {JSON.parse(tool.function.arguments).command}
                        <CheckCircle2 size={12} className="ml-auto text-green-500" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Content */}
                <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="flex items-start gap-3">
               <div className="p-2 rounded-xl bg-white border border-gray-100 text-gray-600 shadow-sm animate-pulse">
                <Bot size={16} />
              </div>
              <div className="flex space-x-1 py-3">
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-gray-100 relative">
        {showMentions && filteredHosts.length > 0 && (
          <div className="absolute bottom-full left-6 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-3 py-2 bg-gray-50 border-bottom border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                <Server size={10} className="mr-1.5" /> Mention Host
            </div>
            {filteredHosts.map(host => (
              <div 
                key={host.id} 
                className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center group transition"
                onClick={() => insertMention(host)}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600 mr-3 shadow-inner">
                   <Hash size={14} />
                </div>
                <div>
                   <div className="text-sm font-semibold text-gray-900">{host.alias}</div>
                   <div className="text-[10px] text-gray-400 font-mono">{host.ip}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50 transition-all shadow-inner">
          <input 
            value={inputValue}
            onChange={handleInputChange}
            disabled={isThinking}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={isThinking ? "Agent is thinking..." : "Type a message or @ to mention a host..."}
            className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed"
          />
          <button 
            onClick={handleSend}
            disabled={!inputValue.trim() || isThinking}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition shadow-lg shadow-blue-500/20"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
