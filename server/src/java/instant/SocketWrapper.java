package instant;

import instant.socketutil.CountingSocket;
import instant.jdbc.SocketTrack;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import javax.net.SocketFactory;

/**
 * A wrapper around a SocketFactory that generates counting sockets
 * that track the amount of data going through them.
 */
public class SocketWrapper extends SocketFactory {

  private final SocketFactory baseFactory;

  public SocketWrapper() {
    this.baseFactory = SocketFactory.getDefault();
  }

  @Override
  public Socket createSocket() throws IOException {
    CountingSocket socket = new CountingSocket();
    SocketTrack.addsocket(socket);
    return socket;
  }

  @Override
  public Socket createSocket(String host, int port)
    throws IOException, UnknownHostException {
    CountingSocket socket = new CountingSocket(host, port);
    SocketTrack.addsocket(socket);
    return socket;
  }

  @Override
  public Socket createSocket(
    String host,
    int port,
    InetAddress localHost,
    int localPort
  ) throws IOException, UnknownHostException {
    CountingSocket socket = new CountingSocket(
      host,
      port,
      localHost,
      localPort
    );
    SocketTrack.addsocket(socket);
    return socket;
  }

  @Override
  public Socket createSocket(InetAddress host, int port) throws IOException {
    CountingSocket socket = new CountingSocket(host, port);
    SocketTrack.addsocket(socket);
    return socket;
  }

  @Override
  public Socket createSocket(
    InetAddress address,
    int port,
    InetAddress localAddress,
    int localPort
  ) throws IOException {
    CountingSocket socket = new CountingSocket(
      address,
      port,
      localAddress,
      localPort
    );
    SocketTrack.addsocket(socket);
    return socket;
  }
}
