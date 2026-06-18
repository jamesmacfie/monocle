// Compatibility barrel for extension-local imports. The public native bridge
// wire contract lives in a workspace package so external clients can share the
// same types without depending on WXT or browser-extension internals.
export * from "@monocle/native-bridge-protocol"
