import { Fence } from '@/components/docs/Fence';

const nodes = {
  document: {
    render: undefined,
  },
  th: {
    attributes: {
      scope: {
        type: String,
        default: 'col',
      },
    },
    render: (props) => <th {...props} />,
  },
  fence: {
    render: Fence,
    attributes: {
      language: {
        type: String,
      },
      showCopy: {
        type: Boolean,
      },
    },
  },
};

export default nodes;
