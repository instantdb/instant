// @ts-nocheck
function deleteMessage(setMessages, messageId: string) {
  db.transact(tx.messages[messageId].delete());
}

function updateMessage(messageId: string, newText: string) {
  db.transact(tx.messages[messageId].update({ text: newText }));
}
