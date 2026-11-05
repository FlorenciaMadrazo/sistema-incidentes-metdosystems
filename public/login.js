'use strict';
const form = document.getElementById('form');
const error = document.getElementById('error');

document.querySelectorAll('[data-email]').forEach((b) => b.addEventListener('click', () => {
  document.getElementById('email').value = b.dataset.email;
  document.getElementById('password').value = b.dataset.pass;
}));

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  error.classList.add('oculto');
  const boton = document.getElementById('ingresar');
  boton.disabled = true; boton.textContent = 'Verificando...';
  try {
    const { usuario } = await api('/api/login', { method: 'POST', body: JSON.stringify({
      email: document.getElementById('email').value, password: document.getElementById('password').value }) });
    location.href = usuario.rol === 'admin' ? '/dashboard.html' : '/reporte.html';
  } catch (e) {
    error.textContent = e.message; error.classList.remove('oculto');
    boton.disabled = false; boton.textContent = 'Ingresar';
  }
});

// Si ya hay una sesión activa, se envía directo a la pantalla de su rol.
fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((yo) => {
  if (yo) location.href = yo.rol === 'admin' ? '/dashboard.html' : '/reporte.html';
});
