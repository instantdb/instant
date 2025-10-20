package instant;

import instant.socketutil.CountingSocket;
import instant.jdbc.SocketTrack;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import javax.net.SocketFactory;

/**
 * A wrapper around a SocketFactory that logs socket creation events and can modify sockets after
 * they are created. This class follows the Decorator pattern.
 */
public class SocketWrapper extends SocketFactory {

  private final SocketFactory baseFactory;

  /**
   * Constructs a LoggingSocketFactory that wraps a given base factory.
   *
   * @param baseFactory The underlying SocketFactory to delegate calls to (e.g.,
   *        SocketFactory.getDefault()). It cannot be null.
   */
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
