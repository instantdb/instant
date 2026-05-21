import { ComponentType } from 'react';
import InstantTodos from '@/lib/recipes/todos';
import InstantAuth from '@/lib/recipes/auth';
import InstantCursors from '@/lib/recipes/cursors';
import InstantCustomCursors from '@/lib/recipes/custom-cursors';
import InstantTopics from '@/lib/recipes/reactions';
import InstantTypingIndicator from '@/lib/recipes/typing-indicator';
import InstantAvatarStack from '@/lib/recipes/avatar-stack';
import InstantMergeTileGame from '@/lib/recipes/merge-tile-game';

export const recipeComponents: Record<string, ComponentType> = {
  todos: InstantTodos,
  auth: InstantAuth,
  cursors: InstantCursors,
  'custom-cursors': InstantCustomCursors,
  reactions: InstantTopics,
  'typing-indicator': InstantTypingIndicator,
  'avatar-stack': InstantAvatarStack,
  'merge-tile-game': InstantMergeTileGame,
};
