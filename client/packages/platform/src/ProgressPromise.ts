export type ProgressPromiseSubscription = {
  unsubscribe: () => void;
};

export type ProgressPromiseObserver<StatusT, ResultT> = {
  next?: (t: StatusT) => void;
  error?: (error: Error) => void;
  complete?: (t: ResultT) => void;
};

export type ProgressPromiseConstructor<StatusT, ResultT> = (
  progress: (status: StatusT) => void,
  resolve: (result: ResultT) => void,
  reject: (error: Error) => void,
) => void;

export class ProgressPromise<StatusT, ResultT> {
  #observers: ProgressPromiseObserver<StatusT, ResultT>[] = [];
  #result:
    | null
    | { type: 'error'; error: Error }
    | { type: 'complete'; result: ResultT } = null;

  constructor(callbackFn: ProgressPromiseConstructor<StatusT, ResultT>) {
    callbackFn(this.#onNext, this.#onComplete, this.#onError);
  }

  #onNext = (status: StatusT) => {
    if (this.#result) {
      return;
    }
    for (const observer of this.#observers) {
      try {
        observer.next && observer.next(status);
      } catch (_e) {}
    }
  };

  #onError = (error: Error) => {
    if (this.#result) {
      return;
    }
    this.#result = { type: 'error', error };
    for (const observer of this.#observers) {
      try {
        observer.error && observer.error(error);
      } catch (_e) {}
    }
    this.#observers = [];
  };

  #onComplete = (result: ResultT) => {
    if (this.#result) {
      return;
    }
    this.#result = { type: 'complete', result };
    for (const observer of this.#observers) {
      try {
        observer.complete && observer.complete(result);
      } catch (_e) {}
    }
    this.#observers = [];
  };

  subscribe(
    observer: ProgressPromiseObserver<StatusT, ResultT>,
  ): ProgressPromiseSubscription {
    if (this.#result) {
      const ret = { unsubscribe: () => null };
      if (this.#result.type === 'error') {
        observer.error && observer.error(this.#result.error);
        return ret;
      } else if (this.#result.type === 'complete') {
        observer.complete && observer.complete(this.#result.result);
        return ret;
      }
    }
    this.#observers.push(observer);
    return {
      unsubscribe: () => {
        this.#observers = this.#observers.filter((o) => o !== observer);
      },
    };
  }

  then(resolve: (result: ResultT) => void, reject: (error: Error) => void) {
    this.subscribe({ error: reject, complete: resolve });
  }

  catch(cb: (error: Error) => void) {
    this.subscribe({ error: cb });
  }

  finally(cb: () => void) {
    this.subscribe({ error: () => cb(), complete: () => cb() });
  }
}
