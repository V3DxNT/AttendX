import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import Navbar from "../components/Navbar";

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
        <ToastProvider>
          <AuthProvider>
            <Navbar />
            <main>{children}</main>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
