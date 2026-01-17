import { useState } from 'react';

type Note = {
  message: string;
};

export const useAttrNotes = () => {
  const [notes, setNotes] = useState<Record<string, Note>>({});

  const setNote = (id: string, message: string) => {
    setNotes((notes) => ({ ...notes, [id]: { message } }));
  };

  const removeNote = (id: string) => {
    setNotes((notes) => {
      const newNotes = { ...notes };
      delete newNotes[id];
      return newNotes;
    });
  };

  return {
    notes,
    setNote,
    removeNote,
  };
};
