// Architecture: content layer. Public surface of the workflow executor
// module. Consumers (the execute-workflow-content tab-message handler in
// shared/hooks/useCommandPaletteStateRedux.tsx, tests) import from here;
// the implementation is split across executor.ts (core policy + dispatch),
// dom.ts (selector/visibility primitives), and the op modules.
export { WorkflowExecutor, workflowExecutor } from "./executor"
