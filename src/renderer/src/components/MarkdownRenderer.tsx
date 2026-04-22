import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

type CodeProps = React.ComponentProps<'code'> & {
  inline?: boolean
  node?: unknown
}

export function MarkdownRenderer({ content }: { content: string }): React.ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ node, inline, className, children, ...props }: CodeProps): React.ReactElement {
          void node
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter
              style={oneLight}
              language={match[1]}
              PreTag="div"
              className="rounded-lg !my-4 border border-border"
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-accent"
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        },
        h1({ children }) {
          return <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="mb-3 mt-5 text-lg font-bold">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>
        },
        li({ children }) {
          return <li className="pl-1">{children}</li>
        },
        blockquote({ children }) {
          return (
            <blockquote className="mb-4 rounded-r-lg border-l-4 border-accent/30 bg-accent-soft/40 py-1 pl-4 text-muted-foreground">
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div className="my-6 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm text-left">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return (
            <thead className="border-b border-border bg-surface-muted text-xs font-semibold text-muted-foreground">
              {children}
            </thead>
          )
        },
        th({ children }) {
          return <th className="px-4 py-3 font-semibold">{children}</th>
        },
        td({ children }) {
          return <td className="border-t border-border px-4 py-3">{children}</td>
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
