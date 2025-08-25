import React from 'react'

interface MonocleTextProps {
  className?: string
  showDescription?: boolean
}

export default function MonocleText({ className = '', showDescription = true }: MonocleTextProps) {
  return (
    <div className={`bg-gray-900 p-6 rounded-lg shadow-lg border border-gray-700 ${className}`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Monocle</h1>
      </div>
      
      {showDescription && (
        <div className="space-y-3">
          <p className="text-gray-300 leading-relaxed">
            Command palette for the web - Press <kbd className="px-2 py-1 bg-gray-700 text-gray-200 rounded text-sm">Cmd+K</kbd> to open
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-blue-900/50 text-blue-200 rounded-full text-sm">React</span>
            <span className="px-3 py-1 bg-emerald-900/50 text-emerald-200 rounded-full text-sm">TypeScript</span>
            <span className="px-3 py-1 bg-cyan-900/50 text-cyan-200 rounded-full text-sm">Tailwind</span>
          </div>
        </div>
      )}
    </div>
  )
}