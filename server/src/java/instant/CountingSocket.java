package instant;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.Socket;

public class CountingSocket extends Socket {

  private CountingInputStream cis;
  private CountingOutputStream cos;

  public CountingSocket() {
    super();
  }

  public CountingSocket(String host, int port) throws IOException {
    super(host, port);
  }

  public CountingSocket(InetAddress addr, int port) throws IOException {
    super(addr, port);
  }

  public CountingSocket(
    String host,
    int port,
    InetAddress localAddr,
    int localPort
  ) throws IOException {
    super(host, port, localAddr, localPort);
  }

  public CountingSocket(
    InetAddress addr,
    int port,
    InetAddress localAddr,
    int localPort
  ) throws IOException {
    super(addr, port, localAddr, localPort);
  }

  @Override
  public synchronized InputStream getInputStream() throws IOException {
    if (cis == null) {
      cis = new CountingInputStream(super.getInputStream());
    }
    return cis;
  }

  @Override
  public synchronized OutputStream getOutputStream() throws IOException {
    if (cos == null) {
      cos = new CountingOutputStream(super.getOutputStream());
    }
    return cos;
  }

  public long getBytesRead() {
    return (cis == null) ? 0 : cis.getBytesRead();
  }

  public long getBytesWritten() {
    return (cos == null) ? 0 : cos.getBytesWritten();
  }
}

class CountingInputStream extends InputStream {

  private final InputStream in;
  private long bytesRead = 0;

  public CountingInputStream(InputStream in) {
    this.in = in;
  }

  @Override
  public int read() throws IOException {
    int r = in.read();
    if (r != -1) {
      bytesRead++;
    }
    return r;
  }

  @Override
  public int read(byte[] b, int off, int len) throws IOException {
    int r = in.read(b, off, len);
    if (r != -1) {
      bytesRead += r;
    }
    return r;
  }

  @Override
  public void close() throws IOException {
    in.close();
  }

  public long getBytesRead() {
    return bytesRead;
  }
}

class CountingOutputStream extends OutputStream {

  private final OutputStream out;
  private long bytesWritten = 0;

  public CountingOutputStream(OutputStream out) {
    this.out = out;
  }

  @Override
  public void write(int b) throws IOException {
    out.write(b);
    bytesWritten++;
  }

  @Override
  public void write(byte[] b, int off, int len) throws IOException {
    out.write(b, off, len);
    bytesWritten += len;
  }

  @Override
  public void flush() throws IOException {
    out.flush();
  }

  @Override
  public void close() throws IOException {
    out.close();
  }

  public long getBytesWritten() {
    return bytesWritten;
  }
}
