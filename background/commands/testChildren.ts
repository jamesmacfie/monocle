import type { Command, ExecutionContext } from "../../types/"

// Level 3 children (deepest level)
const level3Children: Command[] = [
  {
    id: "level3-child-1",
    name: "Level 3 Child 1",
    description: "Deepest level child",
    icon: { name: "Circle" },
    color: "blue",
    run: async () => {
      console.log("Level 3 Child 1 executed")
    },
  },
  {
    id: "level3-child-2",
    name: "Level 3 Child 2",
    description: "Another deepest level child",
    icon: { name: "Square" },
    color: "green",
    run: async () => {
      console.log("Level 3 Child 2 executed")
    },
  },
  {
    id: "level3-child-3",
    name: "Level 3 Child 3",
    description: "Yet another deepest level child",
    icon: { name: "Triangle" },
    color: "purple",
    run: async () => {
      console.log("Level 3 Child 3 executed")
    },
  },
]

// Level 2 children (middle level)
const level2Children: Command[] = [
  {
    id: "level2-child-1",
    name: "Level 2 Child 1",
    description: "Middle level child with its own children",
    icon: { name: "Folder" },
    color: "orange",
    commands: async (_context: ExecutionContext) => level3Children,
  },
  {
    id: "level2-child-2",
    name: "Level 2 Child 2",
    description: "Another middle level child",
    icon: { name: "File" },
    color: "teal",
    run: async () => {
      console.log("Level 2 Child 2 executed")
    },
  },
]

// Level 1 children (first level)
const level1Children: Command[] = [
  {
    id: "level1-child-1",
    name: "Level 1 Child 1",
    description: "First level child with deep nesting",
    icon: { name: "FolderTree" },
    color: "red",
    commands: async (_context: ExecutionContext) => level2Children,
  },
]

// Main test command
export const testChildren: Command = {
  id: "test-children",
  name: "Test Children",
  description: "Test command with deeply nested children",
  icon: { name: "GitBranch" },
  color: "gray",
  commands: async (_context: ExecutionContext) => level1Children,
}
