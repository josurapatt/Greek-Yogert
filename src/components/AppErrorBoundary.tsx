import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unexpected application render failure", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page app-error-boundary" role="alert">
        <section className="modal-card">
          <h1>ไม่สามารถแสดงหน้านี้ได้</h1>
          <p>
            เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาโหลดหน้าใหม่
            หากยังพบปัญหาให้แจ้งผู้ดูแลร้าน
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => window.location.reload()}
          >
            โหลดหน้าใหม่
          </button>
        </section>
      </main>
    );
  }
}
