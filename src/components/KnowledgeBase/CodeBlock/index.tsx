import type { ReactNode } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash'
import css from 'react-syntax-highlighter/dist/cjs/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json'
import markdown from 'react-syntax-highlighter/dist/cjs/languages/prism/markdown'
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/cjs/languages/prism/rust'
import scss from 'react-syntax-highlighter/dist/cjs/languages/prism/scss'
import solidity from 'react-syntax-highlighter/dist/cjs/languages/prism/solidity'
import tsx from 'react-syntax-highlighter/dist/cjs/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/cjs/languages/prism/yaml'
import oneLight from 'react-syntax-highlighter/dist/cjs/styles/prism/one-light'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('solidity', solidity)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('jsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)

interface CodeProps {
  inline?: boolean
  className?: string
  children: ReactNode
}

export const CodeBlock = ({ inline, className, children }: CodeProps) => {
  const match = /language-(\w+)/.exec(className || '')
  const language = match?.[1] ?? 'text'

  if (inline) {
    return <code className={className}>{children}</code>
  }

  return (
    <SyntaxHighlighter
      style={oneLight}
      language={language}
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: '16px',
        borderRadius: '8px',
        fontSize: '0.875rem',
        lineHeight: 1.5,
      }}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  )
}
