# GestureControl – Proyecto NEXO

GestureControl es una aplicación web multiplataforma que permite **controlar acciones mediante gestos de la mano usando solo la cámara**, funcionando directamente desde el navegador sin instalar software adicional.

El sistema detecta en tiempo real tres gestos principales:
- ✋ Mano abierta  
- ✊ Puño  
- 👉 Señalar (índice extendido)

Cada gesto puede activar una acción como:
- Reproducir / Pausar  
- Siguiente  
- Anterior  
- Activar funciones personalizadas

Este proyecto forma parte del **Proyecto NEXO – ITIID – UPSRJ**, demostrando competencias de visión por computadora, interacción natural, documentación profesional y presencia digital.

---

## Tecnologías Utilizadas

- **JavaScript**
- **HTML / CSS**
- **TensorFlow.js**
- **MediaPipe Hands**
- **WebGL**
- Depuración en herramientas del navegador

---

## ¿Cómo funciona?

El flujo del sistema es:
Cámara → MediaPipe/TensorFlow → Extracción de 21 Keypoints → Análisis geométrico → Detección del gesto → Ejecución de acción

---





