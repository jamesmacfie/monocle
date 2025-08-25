import React from 'react'
import { MonocleText } from '../components/shared'

export default function ContentApp() {
  const [isVisible, setIsVisible] = React.useState(true)

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-[99999]">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg transition-colors"
          title="Show Monocle"
        >
          <span className="text-lg font-bold">M</span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[99999] max-w-md">
      <div className="relative">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-200 transition-colors z-10"
          title="Hide Monocle"
        >
          ×
        </button>
        <MonocleText showDescription={true} />
      </div>
    </div>
  )
}