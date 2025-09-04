import { ToastContainer } from "../shared/components/ToastContainer"
import { NewTabCommandPalette } from "./components/NewTabCommandPalette"

export default function NewTabApp() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Monocle</h1>
          <p className="text-gray-600">Command palette for the web</p>
        </div>

        <div className="raycast new-tab-palette">
          <NewTabCommandPalette autoFocus={true} className="w-full" />
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            Press{" "}
            <kbd className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs">
              Cmd+K
            </kbd>{" "}
            on any webpage to open the command palette
          </p>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
