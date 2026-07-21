package instant.jdbc;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.util.Properties;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.postgresql.ssl.LibPQFactory;

/**
 * pgjdbc SSLSocketFactory that keeps pgjdbc/libpq-style SSL behavior, but
 * restricts the negotiated protocol to TLSv1.2.
 */
public final class Tls12SocketFactory extends SSLSocketFactory {
  private static final String[] TLS12_ONLY = new String[] {"TLSv1.2"};

  private final SSLSocketFactory delegate;

  public Tls12SocketFactory() throws Exception {
    this(new Properties());
  }

  public Tls12SocketFactory(Properties props) throws Exception {
    this.delegate = new LibPQFactory(props);
  }

  private Socket forceTls12(Socket socket) {
    if (socket instanceof SSLSocket) {
      ((SSLSocket) socket).setEnabledProtocols(TLS12_ONLY);
    }
    return socket;
  }

  @Override
  public Socket createSocket(Socket socket, String host, int port, boolean autoClose)
      throws IOException {
    return forceTls12(delegate.createSocket(socket, host, port, autoClose));
  }

  @Override
  public Socket createSocket(String host, int port) throws IOException {
    return forceTls12(delegate.createSocket(host, port));
  }

  @Override
  public Socket createSocket(String host, int port, InetAddress localHost, int localPort)
      throws IOException {
    return forceTls12(delegate.createSocket(host, port, localHost, localPort));
  }

  @Override
  public Socket createSocket(InetAddress host, int port) throws IOException {
    return forceTls12(delegate.createSocket(host, port));
  }

  @Override
  public Socket createSocket(
      InetAddress address, int port, InetAddress localAddress, int localPort)
      throws IOException {
    return forceTls12(delegate.createSocket(address, port, localAddress, localPort));
  }

  @Override
  public String[] getDefaultCipherSuites() {
    return delegate.getDefaultCipherSuites();
  }

  @Override
  public String[] getSupportedCipherSuites() {
    return delegate.getSupportedCipherSuites();
  }
}
