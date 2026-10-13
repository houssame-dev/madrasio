import type { Messages } from '../catalogs';

const messages = {
  foundation: {
    appName: 'Madrasio',
    actions: {
      save: 'Enregistrer',
      cancel: 'Annuler',
      close: 'Fermer',
      retry: 'Réessayer',
    },
    greeting: 'Bonjour, {name} !',
  },
} as const satisfies Messages;

export default messages;
