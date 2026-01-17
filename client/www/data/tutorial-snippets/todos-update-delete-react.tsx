// @ts-nocheck
function deleteMessage(setMessages, messageId: string) {
  setMessages((messages) =>
    messages.filter((message) => message.id !== messageId),
  );
}

function updateMessage(setMessages, messageId: string, newText: string) {
  setMessages((messages) =>
    messages.map((message) =>
      message.id === messageId ? { ...message, text: newText } : message,
    ),
  );
}
