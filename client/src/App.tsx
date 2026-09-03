import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import Login from "./pages/Login";
import FormsList from "./pages/FormsList";
import FormBuilder from "./pages/FormBuilder";
import FormFill from "./pages/FormFill";
import FormResponses from "./pages/FormResponses";
import Staff from "./pages/Staff";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<FormsList />} />
            <Route path="/forms/:id/fill" element={<FormFill />} />
            <Route
              path="/forms/:id/edit"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <FormBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/forms/:id/responses"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <FormResponses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <Staff />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
