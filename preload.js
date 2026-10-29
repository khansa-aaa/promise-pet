const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('promisePet', {
  getState: () => ipcRenderer.invoke('state:get'),
  add: (text) => ipcRenderer.invoke('promise:add', text),
  toggle: (id) => ipcRenderer.invoke('promise:toggle', id),
  remove: (id) => ipcRenderer.invoke('promise:remove', id),
  edit: (id, text) => ipcRenderer.invoke('promise:edit', id, text),
  carry: () => ipcRenderer.invoke('promise:carry'),
  taskAdd: (text) => ipcRenderer.invoke('task:add', text),
  taskToggle: (id) => ipcRenderer.invoke('task:toggle', id),
  taskEdit: (id, text) => ipcRenderer.invoke('task:edit', id, text),
  taskRemove: (id) => ipcRenderer.invoke('task:remove', id),
  taskClearDone: () => ipcRenderer.invoke('task:clearDone'),
  taskPromote: (id) => ipcRenderer.invoke('task:promote', id),
  scheduleAdd: () => ipcRenderer.invoke('schedule:add'),
  scheduleUpdate: (id, patch) => ipcRenderer.invoke('schedule:update', id, patch),
  scheduleRemove: (id) => ipcRenderer.invoke('schedule:remove', id),
  space: () => ipcRenderer.invoke('win:space'),
  resize: (w, h) => ipcRenderer.send('win:resize', { w, h }),
  dragStart: () => ipcRenderer.send('drag:start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag:move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('drag:end'),
  quit: () => ipcRenderer.send('app:quit'),
  petMenu: () => ipcRenderer.send('pet:menu'),
  onOpenBubble: (cb) => ipcRenderer.on('open-bubble', cb)
});
