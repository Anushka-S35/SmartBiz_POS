import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button, ErrorBanner, Page } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("React error boundary caught:", error, errorInfo);
  }

  override render(): React.JSX.Element {
    if (this.state.hasError) {
      return (
        <Page>
          <ErrorBanner>Something went wrong.</ErrorBanner>
          <Button onPress={() => void this.setState({ hasError: false })}>
            Try again
          </Button>
        </Page>
      );
    }
    const children = this.props.children;
    if (children === undefined || children === null) {
      return <Page />;
    }
    return children as React.JSX.Element;
  }
}