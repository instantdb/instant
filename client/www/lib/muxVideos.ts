// Note: mux lets you specify a 'placeholder' image
// Use https://blurup.vercel.app/
// to generate one for new videos

import { MuxPlayerProps } from '@mux/mux-player-react/.';

export const goingOffline: MuxPlayerProps = {
  streamType: 'on-demand',
  playbackId: 'l1UOG6KX5f4tC402kuIyUzOS3esKZ8rQj4xhEdl02CMv00',
  primaryColor: '#FFFFFF',
  secondaryColor: '#000000',
  placeholder: `data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="20"/><feComponentTransfer><feFuncA type="discrete" tableValues="1 1"/></feComponentTransfer></filter><g filter="url(%23b)"><image width="100%" height="100%" preserveAspectRatio="xMidYMid slice" href="data:image/webp;base64,UklGRj4AAABXRUJQVlA4IDIAAADQAQCdASoQAAkAAQAcJaQAAueIKWgUwAD+/1+XeGm3LVZ795ZFFJLAAbHfXML34AAAAA=="/></g></svg>`,
  style: { aspectRatio: '16/9' },
};

export const instldraw: MuxPlayerProps = {
  streamType: 'on-demand',
  playbackId: 'BF2GiQnQz6XXhJ3Wjee95sByIaHI2Y00x2ESFjVEzAk00',
  primaryColor: '#FFFFFF',
  secondaryColor: '#000000',
  placeholder: `data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="20"/><feComponentTransfer><feFuncA type="discrete" tableValues="1 1"/></feComponentTransfer></filter><g filter="url(%23b)"><image width="100%" height="100%" preserveAspectRatio="xMidYMid slice" href="data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAADwAQCdASoQAAkAAQAcJaQC7AEf/sEI6sAA/v8UKUnG+sPhuXChIT9tfCeb/bJIQQzrISZCHaMgVcAm+AQxjvC8sig1R4AA"/></g></svg>`,
  style: { aspectRatio: '16/9' },
};

export const walkthrough: MuxPlayerProps = {
  streamType: 'on-demand',
  playbackId: 'mU6GjiVdRulYNsb34hGu9dfvghjQibq6pWoOzCmpYiM',
  primaryColor: '#FFFFFF',
  secondaryColor: '#000000',
  placeholder: `data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="20"/><feComponentTransfer><feFuncA type="discrete" tableValues="1 1"/></feComponentTransfer></filter><g filter="url(%23b)"><image width="100%" height="100%" preserveAspectRatio="xMidYMid slice" href="data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAAAwAgCdASoQAAoAAQAcJaQC7H8AGBvm9JqyAAD+/mVFyNo3XECtBS+Gp2qGzM7SRSe7VcvFyt53Oecwgr8gIDgQPEFW7dIg+7AtgAAA"/></g></svg>`,
  style: { aspectRatio: '209/135' },
  thumbnailTime: 242,
};
