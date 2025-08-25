console.log('Monocle extension background script loaded!')

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'get-commands') {
    sendResponse({ commands: [] })
  } else if (request.type === 'execute-command') {
    console.log('Executing command:', request.commandId)
    sendResponse({ success: true })
  }
})