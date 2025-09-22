import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3000

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")))

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})
