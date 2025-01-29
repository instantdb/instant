import { Component, PropsWithChildren } from 'react';

export class ErrorBoundary extends Component<
  PropsWithChildren<{
    renderError: () => React.ReactNode;
  }>,
  { hasError: boolean }
> {
  constructor(props: { renderError: () => React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.renderError();
    }

    return this.props.children;
  }
}
