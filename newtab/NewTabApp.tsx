import React from 'react'
import { MonocleText } from '../components/shared'

export default function NewTabApp() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Welcome to Monocle</h1>
          <p className="text-gray-400 text-lg">
            Your command palette extension is ready to use on any webpage
          </p>
        </div>
        
        <MonocleText className="mx-auto" showDescription={true} />
        
        <div className="mt-8 text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-gray-800/50 p-4 rounded-lg">
              <div className="text-blue-400 text-sm font-medium mb-1">Content Script</div>
              <div className="text-gray-300 text-sm">Injected into webpages</div>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg">
              <div className="text-emerald-400 text-sm font-medium mb-1">New Tab</div>
              <div className="text-gray-300 text-sm">Clean new tab experience</div>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg">
              <div className="text-cyan-400 text-sm font-medium mb-1">Shared Components</div>
              <div className="text-gray-300 text-sm">Reusable across contexts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}