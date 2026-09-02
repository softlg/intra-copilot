chrome.runtime.onInstalled.addListener(()=>{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});});
chrome.runtime.onMessage.addListener((msg:any,sender:any)=>{if(msg?.type==='OPEN_SIDE_PANEL'&&sender.tab?.windowId!==undefined){chrome.sidePanel.open({windowId:sender.tab.windowId}).catch(()=>{});}});
