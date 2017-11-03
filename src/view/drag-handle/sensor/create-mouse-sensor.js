// @flow
/* eslint-disable no-use-before-define */
import stopEvent from '../stop-event';
import createScheduler from '../create-scheduler';
import isSloppyClickThresholdExceeded from '../is-sloppy-click-threshold-exceeded';
import * as keyCodes from '../../key-codes';
import type {
  Position,
} from '../../../types';
import type {
  Callbacks,
  Sensor,
} from '../drag-handle-types';

type State = {
  isDragging: boolean,
  pending: ?Position
}

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const primaryButton = 0;
const noop = () => { };

export default (callbacks: Callbacks): Sensor => {
  let state: State = {
    isDragging: false,
    pending: null,
  };
  const setState = (newState: State): void => {
    state = newState;
  };
  const isDragging = (): boolean => state.isDragging;
  const isCapturing = (): boolean => Boolean(state.pending || state.isDragging);

  const schedule = createScheduler(callbacks, isDragging);

  const startDragging = (fn?: Function = noop) => {
    setState({
      pending: null,
      isDragging: true,
    });
    fn();
  };
  const stopDragging = (fn? : Function = noop) => {
    unbindWindowEvents();
    setState({
      isDragging: false,
      pending: null,
    });
    fn();
  };
  const startPendingDrag = (point: Position) => {
    setState({ pending: point, isDragging: false });
    bindWindowEvents();
  };
  const stopPendingDrag = () => {
    stopDragging();
  };

  const cancel = () => {
    if (state.pending) {
      stopPendingDrag();
      return;
    }
    stopDragging(callbacks.onCancel);
  };

  const windowBindings = {
    mousemove: (event: MouseEvent) => {
      const { button, clientX, clientY } = event;
      if (button !== primaryButton) {
        return;
      }

      const point: Position = {
        x: clientX,
        y: clientY,
      };

      if (state.isDragging) {
        schedule.move(point);
        return;
      }

      if (!state.pending) {
        console.error('invalid state');
        return;
      }

      // drag is pending

      // threshold not yet exceeded
      if (!isSloppyClickThresholdExceeded(state.pending, point)) {
        return;
      }

      startDragging(() => callbacks.onLift(point));
    },
    mouseup: () => {
      if (state.pending) {
        stopPendingDrag();
        return;
      }

      stopDragging(callbacks.onDrop);
    },
    mousedown: () => {
      // this can happen during a drag when the user clicks a button
      // other than the primary mouse button
      stopDragging(callbacks.onCancel);
    },
    keydown: (event: KeyboardEvent) => {
      // cancelling
      if (event.keyCode === keyCodes.escape) {
        stopEvent(event);
        cancel();
        return;
      }

      // blocking standard browser behavior
      const shouldBlock: boolean =
        // submission
        event.keyCode === keyCodes.enter ||
        // tabbing
        event.keyCode === keyCodes.tab;

      if (shouldBlock) {
        stopEvent(event);
      }
    },
    resize: cancel,
    scroll: () => {
      // stop a pending drag
      if (state.pending) {
        stopPendingDrag();
        return;
      }
      schedule.windowScrollMove();
    },
  };

  const eventKeys = Object.keys(windowBindings);

  const bindWindowEvents = () => {
    eventKeys.forEach((eventKey: string) => {
      if (eventKey === 'scroll') {
        window.addEventListener(eventKey, windowBindings.scroll, { passive: true });
        return;
      }

      window.addEventListener(eventKey, windowBindings[eventKey]);
    });
  };

  const unbindWindowEvents = () => {
    eventKeys.forEach((eventKey: string) =>
      window.removeEventListener(eventKey, windowBindings[eventKey])
    );
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (state.isDragging || state.pending) {
      console.error('should not be able to perform a mouse down while a drag or pending drag is occurring');
      stopDragging(callbacks.onCancel);
      return;
    }

    const { button, clientX, clientY } = event;

    if (button !== primaryButton) {
      return;
    }

    stopEvent(event);

    const point: Position = {
      x: clientX,
      y: clientY,
    };

    startPendingDrag(point);
  };

  const sensor: Sensor = {
    start: onMouseDown,
    end: () => console.warn('end not yet implemented'),
    isCapturing: () => Boolean(state.pending || state.isDragging),
    isDragging,
  };

  return sensor;
};
