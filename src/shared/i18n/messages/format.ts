import { defineMessages } from '../define';

export default defineMessages(
  {
    today: 'hoje',
    yesterday: 'ontem',
    daysAgo: (n: number) => `há ${n} dias`,
    monthsAgo: (n: number) => `há ${n} ${n > 1 ? 'meses' : 'mês'}`,
    yearsAgo: (n: number) => `há ${n} ano${n > 1 ? 's' : ''}`,
  },
  {
    today: 'today',
    yesterday: 'yesterday',
    daysAgo: (n: number) => `${n} days ago`,
    monthsAgo: (n: number) => `${n} month${n > 1 ? 's' : ''} ago`,
    yearsAgo: (n: number) => `${n} year${n > 1 ? 's' : ''} ago`,
  },
);
