import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter
              style={oneLight}
              language={match[1]}
              PreTag="div"
              className="rounded-lg !my-4 border border-gray-100 shadow-sm"
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-[0.9em]" {...props}>
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        },
        h1({ children }) { return <h1 className="text-xl font-black mb-4 mt-6">{children}</h1> },
        h2({ children }) { return <h2 className="text-lg font-black mb-3 mt-5">{children}</h2> },
        h3({ children }) { return <h3 className="text-base font-black mb-2 mt-4">{children}</h3> },
        ul({ children }) { return <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul> },
        ol({ children }) { return <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol> },
        li({ children }) { return <li className="pl-1">{children}</li> },
        blockquote({ children }) {
          return <blockquote className="border-l-4 border-blue-200 pl-4 py-1 italic text-gray-500 mb-4 bg-blue-50/30 rounded-r-lg">{children}</blockquote>
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-6 rounded-xl border border-gray-200">
              <table className="w-full text-sm text-left">{children}</table>
            </div>
          )
        },
        thead({ children }) { return <thead className="bg-gray-50 border-b border-gray-200 uppercase text-[10px] font-black tracking-widest text-gray-400">{children}</thead> },
        th({ children }) { return <th className="px-4 py-3 font-black">{children}</th> },
        td({ children }) { return <td className="px-4 py-3 border-t border-gray-100">{children}</td> },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
