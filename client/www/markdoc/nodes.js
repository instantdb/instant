import { Fence } from '@/components/docs/Fence';
import { Heading } from '@/components/docs/Heading';

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
      lineHighlight: {
        type: String,
      },
      showCopy: {
        type: Boolean,
      },
    },
  },
  heading: {
    render: Heading,
    attributes: {
      id: { type: String },
      level: { type: Number, required: true },
    },
  },
};

export default nodes;
