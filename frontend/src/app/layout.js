import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export const metadata = {
  title: "AttendX — Computer Vision Attendance System",
  description: "Next-generation biometric facial recognition attendance system for universities.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="liquid-bg-overlay" />
        <div className="liquid-bg-tint" />
        <ToastProvider>
          <AuthProvider>
            <div className="liquid-screen-wrapper">
              <div className="liquid-glass-shell">
                <Navbar />
                <main className="liquid-content-screen">{children}</main>
                <Footer />
              </div>
            </div>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
