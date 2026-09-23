import { useNavigate } from "react-router-dom";

// Cinematic page transition: fades the apply shell content out, then navigates.
// The new page fades in via the .apply-fade-in class on #apply-root.
export default function useFadeNavigate() {
  const navigate = useNavigate();
  return (to) => {
    const root = document.getElementById("apply-root");
    if (!root) {
      navigate(to);
      return;
    }
    root.style.transition = "opacity 240ms ease";
    root.style.opacity = "0";
    setTimeout(() => navigate(to), 250);
  };
}