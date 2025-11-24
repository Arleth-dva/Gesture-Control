# Carpeta `/src` – Código Fuente del Sistema

Esta carpeta contiene el núcleo completo del proyecto **GestureControl**, incluyendo:

- Interfaz de usuario
- Motor de detección con MediaPipe Hands
- Clasificador geométrico de gestos
- Módulos internos del pipeline
- Implementación PWA (manifest + service worker)
- Lógica de renderizado y procesamiento en tiempo real

Es el **source code** principal de la aplicación.

---

## Contenido

```
src/
│
├── index.html        # Documento raíz y estructura principal
├── style.css         # Estilos y layout visual
├── app.js            # Entry point del sistema
├── app_module.js     # Motor de visión y renderizado
├── classify.js       # Clasificador de gestos (reglas geométricas)
├── logger.js         # Logging y diagnóstico
├── manifest.json     # Configuración PWA
└── sw.js             # Service Worker (offline + caché)
```

---

# Descripción Técnica por Archivo

## `index.html`
- Define la estructura visual del proyecto en el DOM.
- Contiene los elementos base:
  - `<video>` para la cámara
  - `<canvas>` para el render del esqueleto
  - Paneles de información y controles
- Importa scripts modulares y estilos.
- Es el punto de entrada visual de la PWA.

---

## `style.css`
- Maneja:
  - Posicionamiento responsivo de los elementos
  - Overlay entre cámara y canvas
  - Panel de estado y tipografía
  - Temas, colores y espaciado
- Optimizado para no interferir con los ciclos de render del canvas.

---

## `app.js`
- **Punto de inicio del sistema**.
- Gestiona:
  - Solicitud de cámara vía WebRTC
  - Inicialización del detector MediaPipe (runtime mediapipe)
  - Activación del render loop (`requestAnimationFrame`)
- Orquesta el pipeline completo:
  **Init → Frame → Detector → Keypoints → Classify → Render/Acción**
- Conecta interfaz, detector y módulos secundarios.

---

## `app_module.js`
- Contiene el **motor de visión por computadora**, incluyendo:
  - Setup del detector
  - Toma de frames desde `<video>`
  - Preprocesamiento de coordenadas
  - Renderizado del esqueleto en el canvas
- Separa la lógica pesada de procesamiento del flujo principal.
- Diseñado para escalabilidad y modularidad del proyecto.

---

## `classify.js`
- Implementa el **clasificador geométrico**.
- Analiza los 21 keypoints entregados por MediaPipe Hands.
- Calcula:
  - Distancias euclidianas
  - Relaciones angulares
  - Extensiones/flexiones por dedo
  - Métricas proporcionales basadas en la palma
- Retorna `{ gesture, confidence }`.
- Fácilmente extensible para nuevos gestos.

---

## `logger.js`
- Sistema de logging interno.
- Guarda:
  - Errores
  - Eventos de detección
  - Transiciones entre gestos
- Útil para depuración y análisis del comportamiento del sistema.
- Puede usarse para recolectar datos de entrenamiento en casos avanzados.

---

## `manifest.json`
- Convierte el proyecto en una **PWA instalable**.
- Define:
  - Nombre y branding
  - Iconos
  - Display mode (`standalone`)
  - Colores del tema
- Permite instalar GestureControl como aplicación móvil o de escritorio.

---

## `sw.js`
- Implementación del **Service Worker**.
- Gestiona:
  - Estrategias de caché
  - Modo offline
  - Optimización de carga de recursos
- Garantiza rápido acceso y mayor estabilidad en conexiones inestables.

---

# Dependencias Técnicas

### Bibliotecas externas
- **MediaPipe Hands (runtime mediapipe)** – inferencia optimizada con WebGL/WASM.
- **TensorFlow.js** – soporte para modelos ML (futuras extensiones).

### APIs del navegador
- WebRTC → Captura de video  
- Canvas 2D → Render de esqueleto  
- Service Worker → PWA offline  
- WebGL → Aceleración del runtime mediapipe  

---

## ▶️ Cómo Ejecutarlo

El proyecto puede ejecutarse en **laptop/PC** y en **teléfono móvil**.  
Debido al uso de la cámara y funciones PWA, **debe abrirse desde un servidor local** (no con doble clic).

---

### 💻 Ejecución en Laptop / PC

#### **Requisitos**
- Navegador moderno (Chrome recomendado)
- Acceso a cámara
- Servidor local como:
  - Python: `python -m http.server 8000`
  - Node.js: `npx http-server`
  - VS Code + Live Server
  - Cualquier servidor HTTP similar

#### **Pasos**
1. Abrir una terminal en la carpeta raíz del proyecto.
2. Ejecutar un servidor, por ejemplo:

   ```bash
   python -m http.server 8000
   ```

3. Abrir en el navegador:

   ```
   http://localhost:8000/src/index.html
   ```

4. Conceder permisos de cámara.
5. Colocar la mano frente a la cámara para comenzar la detección.

---

### 📱 Ejecución en Teléfono Móvil

#### **Requisitos**
- Teléfono conectado a la misma red WiFi que la laptop
- Navegador móvil actualizado
- Permiso de cámara habilitado

#### **Opción A: Usar el servidor de tu laptop**
1. Obtener la IP local de la laptop (ejemplo):

   ```
   192.168.0.12
   ```

2. En el navegador del teléfono abrir:

   ```
   http://192.168.0.12:8000/src/index.html
   ```

3. Aceptar permisos de cámara.

---

#### **Opción B: Instalar la App como PWA**
1. Abrir el proyecto desde el navegador del móvil.
2. Abrir el menú (tres puntos).
3. Seleccionar: **"Agregar a la pantalla de inicio"**.
4. La aplicación se instalará como **PWA** y podrá ejecutarse a pantalla completa.

---

### 📝 Notas Importantes
- No funciona abriendo `index.html` directamente desde el explorador de archivos.
- Algunos navegadores móviles bloquean la cámara en modo incógnito.
- Una buena iluminación mejora significativamente la detección.

---

#  Notas Técnicas

- Todo ocurre **on-device**, sin enviar datos a la nube.
- El sistema usa reglas geométricas, no un modelo entrenado.
- La modularidad facilita añadir gestos sin romper el pipeline.
- `classify.js` puede ampliarse introduciendo nuevos patrones de keypoints.




