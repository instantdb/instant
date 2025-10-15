import EventSourceShim from './EventSourceShim';

const EventSourceImpl = typeof EventSource === 'undefined' ? EventSourceShim : EventSource;

export default EventSourceImpl;
