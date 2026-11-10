# Homologación visual del catálogo de jarcería — resultado

**Publicada y verificada en operación el 9 de noviembre de 2026.** Jarcería conserva sus funciones y datos, con la cabecera, acciones, filtros, chips y estados homologados con el catálogo de Limpieza. No es una entrega limitada a QA.

## Diagnóstico previo y componentes reutilizados

Se revisaron los informes de activación, corrección del módulo y clasificación, y se compararon las pantallas operativas a las mismas resoluciones antes de modificar código.

Las cuatro tarjetas, el listado, los precios por presentación, categorías, búsqueda, filtros, edición, altas y exportación ya existían. No se recrearon. Ambos catálogos ya usaban `SummaryCard`, `ContentPanel`, `DataTable`, `TableActions` y el sistema de diálogos. Las diferencias estaban en la organización y las celdas:

| Diferencia encontrada | Corrección |
|---|---|
| Jarcería repetía su nombre como título del contenedor | «Lista de productos» y la misma descripción que Limpieza |
| Acciones secundarias como enlaces aislados debajo de la cabecera | Categorías, Exportar Excel, Acciones por lote y Nuevo producto reunidos en la cabecera |
| Filtros dentro de un panel ancho con espacio desaprovechado | Dos controles compactos, alineados, sin el fondo del panel anterior |
| Categorías en texto plano | `TableBadge` con la paleta y `categoryStyle` existentes |
| Estado en texto plano | `StatusBadge`, con Activo / No disponible |
| Columnas demasiado anchas y edición fuera del área inicial | Anchos ajustados, texto adaptable y acciones fijadas al extremo derecho |

Se conservaron `PrimaryAction` para el botón principal, `TableActions` para editar y los componentes originales del editor y del alta por lote. Se reutilizó `ActionMenu` para el acceso al alta por lote. El botón de exportación utiliza las mismas clases visuales de Limpieza y mantiene la función original de exportación filtrada de jarcería; no se sustituyó por el exportador de Limpieza.

No se modificaron componentes visuales compartidos ni estilos globales. Los ajustes CSS nuevos están limitados a `.hardware-catalog` y sus descendientes.

## Resultado visual

- Encabezado principal «Productos de jarcería», con descripción consistente con Limpieza.
- Cuatro tarjetas: Productos totales, Disponibles, No disponibles y Categorías. Mismo componente, bordes, sombras, iconografía y separación; sin tarjetas de líneas ni grupos de precio.
- Cabecera «Lista de productos» / «Consulta y administra los productos disponibles en CalcQuim.».
- Una sola ubicación para cada acción superior. Nuevo producto conserva el azul principal; las acciones secundarias mantienen jerarquía y agrupación.
- Categorías completas en chips de colores estables y lectura adaptable, también en las tarjetas estrechas. «Sin categoría» utiliza estilo neutro.
- Filtros por categoría y estado, más un único buscador por nombre/presentación. Se conservó la lógica original de filtrado.
- Tabla con Producto, Precio, Categoría, Presentaciones, Unidad de inventario, Estado y Acciones. Precios y presentaciones permanecen separados y vinculados correctamente.
- En 390 px se mantienen nombre, precio, categoría y estado en la información principal; los detalles y la edición siguen disponibles al desplegar la tarjeta.

## Categorías y colores

Se reutiliza la derivación de colores por **ID inmutable** que ya existe para categorías sin `colorKey`. No utiliza azar ni depende del orden de la lista o del nombre. No se escribió configuración de colores en PostgreSQL ni se modificaron categorías.

| Categoría | Color reutilizado | Texto | Fondo | Contraste medido, aprox. |
|---|---|---|---|---:|
| Papel higiénico | Pizarra | `#525f78` | `#e6ebf3` | 5,37:1 |
| Papel y toallas | Azul | `#2858ba` | `#e2ebff` | 5,50:1 |
| Productos para baño | Celeste | `#087697` | `#dbf3fc` | 4,50:1 |
| Fibras y esponjas | Turquesa | `#07766b` | `#d9f3ec` | 4,72:1 |
| Atomizadores | Verde | `#35752e` | `#e3f2da` | 4,81:1 |
| Jabones en barra y polvo | Lima | `#62710f` | `#eef3cd` | 4,72:1 |
| Accesorios de limpieza | Ámbar | `#956400` | `#fff0ca` | 4,53:1 |
| Recipientes y contenedores | Terracota | `#ac4915` | `#ffe8d8` | 4,78:1 |
| Higiene personal | Rosa | `#ad3669` | `#fce0ec` | 4,85:1 |

Se verificaron nueve combinaciones distintas y la estabilidad tras recargar. El mínimo sin redondear es aproximadamente 4,504:1. El nombre completo sigue siendo la identificación de la categoría; el color es complementario. [Mediciones en navegador](artifacts/web-homologacion-jarceria-20261109/browser-colors-filters.json).

## Precios y funcionalidades

La consulta fresca confirmó **revisión 185**, 25 productos de jarcería y nueve categorías. Se mantuvieron los precios actuales de Mr. Big 600: **$31 por paquete de cuatro y $10 por rollo**. Las demás presentaciones conservan sus importes y factores.

Se verificaron búsqueda, filtros por las nueve categorías y estado, paginación, controles de ordenamiento, acceso a categorías y diálogos. En PostgreSQL QA se guardaron un alta individual, un alta por lote y ediciones de un producto de ensayo; también se comprobó el estado No disponible y el chip neutro sin categoría. Los 96 productos originales copiados, sus presentaciones y las nueve categorías permanecieron sin cambios en QA; los dos artículos de prueba existen únicamente en el esquema de ensayo.

La exportación filtrada de Papel higiénico descargó un XLSX válido con **seis filas de presentaciones** y sus precios existentes: 45, 12, 31, 10, 60 y 13. Se inspeccionaron las filas y valores del archivo. [Exportación QA](artifacts/web-homologacion-jarceria-20261109/qa-export-papel.xlsx).

No se cambiaron los formularios, sus reglas de guardado, la política de inicial opcional ni el funcionamiento comercial de exportación. Jarcería continúa sin líneas y sin grupos de precio. No se tocaron compras, mayoreo, ventas, inventarios ni lavandería.

## Pruebas y adaptación

- **302 pruebas web aprobadas**, cero fallos y omisiones. Se actualizaron únicamente dos textos esperados de una prueba de render para corresponder a «Lista de productos» y «Nuevo producto». [Log](artifacts/web-homologacion-jarceria-20261109/regression.log).
- Build QA y build operativo con código de salida **0**. [Build QA](artifacts/web-homologacion-jarceria-20261109/build.log), [build operativo](artifacts/web-homologacion-jarceria-20261109/operational-build.log).
- Revisión visual de Limpieza y Jarcería a **1366, 768 y 390 px**. En los seis casos, el ancho del documento coincidió con el viewport. Se conservan cinco tarjetas específicas de Limpieza y cuatro de Jarcería.
- Diálogo de alta a 390 px: ancho **366 px**, documento 390 px. Se abrió y canceló, sin guardar en operación.
- Navegación posterior a la publicación: **cero errores de JavaScript o consola** durante las comprobaciones finales.
- Health/live, readiness y salud de acceso móvil: **200**. Gestor listo, con `mobileWarning=false`.

[Navegador operativo](artifacts/web-homologacion-jarceria-20261109/browser-operational.json), [formularios QA](artifacts/web-homologacion-jarceria-20261109/browser-forms.json), [preservación del catálogo QA](artifacts/web-homologacion-jarceria-20261109/qa-data-preservation.json) y [health/móvil](artifacts/web-homologacion-jarceria-20261109/health-mobile.json).

La primera descarga de ensayo se interrumpió por una recarga de optimización de dependencias del Vite QA. Se corrigió la configuración del servidor de ensayo y se repitió satisfactoriamente la descarga y su inspección. No se cambió el exportador ni la configuración de Vite operativo para resolverlo.

## Archivos publicados

| Archivo | Cambio |
|---|---|
| `src/pages/HardwareProductsPage.jsx` | Organización visual, componentes reutilizados, tamaños de columnas y accesibilidad de filtros |
| `src/styles/components/HardwareCatalog.css` | Estilos nuevos, limitados al catálogo de jarcería |
| `src/App.jsx` | Descripción breve del encabezado de jarcería |
| `tests/organization-render.test.js` | Dos textos esperados actualizados |

[Manifiesto y hashes](artifacts/web-homologacion-jarceria-20261109/published-files.json). Se respaldaron los tres archivos originales existentes en `artifacts/web-homologacion-jarceria-20261109/original-frontend.zip`; la hoja CSS es nueva. Los hashes se verificaron antes de copiar y después de publicar. No se encontraron conflictos ni modificaciones recientes sobre esos archivos.

Se utilizó primero una copia QA separada y un esquema nuevo en `calcquim_activation_test`. La publicación se realizó con el gestor detenido y los puertos de la aplicación cerrados, comprobando que Vite no estuviera observando el árbol. Se arrancó el mismo gestor, que administra Vite, API y acceso móvil como una unidad. No se reinició PostgreSQL ni se modificó el código del backend.

## Conservación operativa

Las lecturas anterior y posterior a publicar se realizaron mediante transacciones de solo lectura. Ambas conservaron **revisión 185** y generación `39656fe8-6025-4740-8f19-8b767f1e9a9c`.

La comparación completa confirmó igualdad de dataset, catálogo, inventario, movimientos y auditoría, composición física y seguimiento de compras. No hubo escrituras comerciales, cambios de categorías/asignaciones, precios, factores, costos, proveedores ni reposición. La corrección pendiente de Mr. Big no se ejecutó.

Se comprobaron sin cambios **128 archivos protegidos** de backend, migraciones, dominio, servicios y formularios de ventas/lavandería, además de siete módulos del cliente móvil. No se cambió, compiló ni instaló Android, ni se modificaron contratos móviles. No se ejecutaron migraciones operativas, commits ni pushes.

[Comparación integral de datos y hashes](artifacts/web-homologacion-jarceria-20261109/integrity.json).

## Capturas comparativas

| Resolución | Jarcería antes | Jarcería después | Limpieza antes | Limpieza después |
|---|---|---|---|---|
| 1366 px | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-jarceria-1366.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-jarceria-1366.png) | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-limpieza-1366.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-limpieza-1366.png) |
| 768 px | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-jarceria-768.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-jarceria-768.png) | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-limpieza-768.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-limpieza-768.png) |
| 390 px | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-jarceria-390.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-jarceria-390.png) | [Antes](artifacts/web-homologacion-jarceria-20261109/antes-limpieza-390.png) | [Después](artifacts/web-homologacion-jarceria-20261109/despues-limpieza-390.png) |

[Precios de Mr. Big y chips en operación](artifacts/web-homologacion-jarceria-20261109/precios-mr-big-operativos.png).

## Estado y pendientes

**Homologación aplicada en operación y validada, sin pendientes bloqueantes de este alcance.** En 768 px la tabla conserva desplazamiento interno para sus siete columnas y la edición fija; en 390 px utiliza tarjetas. No se fuerza la eliminación de información para hacer caber todas las columnas en una pantalla estrecha.

Persiste la advertencia de build por chunks grandes, ajena a esta corrección. La paleta finita garantiza colores distintos para las nueve categorías actuales; futuras categorías podrían compartir un tono derivado del ID. Los documentos privados y la copia QA contienen información comercial y deben mantenerse privados.
