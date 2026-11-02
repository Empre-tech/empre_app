// Sugerir la sección de un producto o insumo por su nombre, con un diccionario de palabras (sin IA y sin red). Solo
// sugiere entre las secciones que el negocio ya tiene; el dueño confirma o elige otra.
// Sin imports: así corre igual en la app y en `node --test`.

export interface NamedSection {
  id: string;
  name: string;
}

/** Minúsculas, sin tildes, sin signos: «Azúcar Manuelita» → «azucar manuelita». */
function plain(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Son la misma palabra en singular o plural? «postre»/«postres», «pan»/«panes», «hamburguesa»/«hamburguesas». */
function sameWord(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

/** Palabras que no sirven para reconocer una sección por su nombre. */
const STOP = new Set(['para', 'con', 'sin', 'del', 'por', 'otros', 'otras', 'mas', 'los', 'las']);

/**
 * Palabras que delatan cada sección (por nombre de sección del catálogo de Empre). Cuentan en singular o plural y como
 * palabra entera. Una sección que el negocio no tiene se ignora.
 */
const KEYWORDS: Record<string, string[]> = {
  // Lo que se vende
  Bebidas: ['gaseosa', 'coca cola', 'pepsi', 'postobon', 'agua', 'refresco', 'malta', 'kola', 'colombiana', 'soda', 'te', 'hit', 'jugo', 'limonada', 'bebida', 'speed', 'gatorade', 'energizante'],
  Cervezas: ['cerveza', 'aguila', 'poker', 'club colombia', 'costena', 'costenita', 'corona', 'pilsen', 'redds', 'budweiser', 'heineken'],
  Licores: ['aguardiente', 'ron', 'whisky', 'tequila', 'vodka', 'vino', 'guaro', 'licor'],
  'Aguardiente y ron': ['aguardiente', 'ron', 'guaro', 'antioqueno', 'medellin', 'tres esquinas'],
  'Otros licores': ['whisky', 'tequila', 'vodka', 'vino', 'ginebra', 'brandy', 'licor'],
  'Gaseosas y aguas': ['gaseosa', 'coca cola', 'pepsi', 'postobon', 'agua', 'kola', 'colombiana', 'soda', 'malta'],
  Hielo: ['hielo'],
  'Granos y abarrotes': ['arroz', 'azucar', 'frijol', 'lenteja', 'garbanzo', 'aceite', 'sal', 'harina', 'pasta', 'espagueti', 'panela', 'atun', 'sardina', 'salsa', 'maiz', 'avena', 'chocolate', 'cafe', 'margarina', 'vinagre', 'maizena', 'gelatina', 'enlatado'],
  'Lácteos y huevos': ['leche', 'queso', 'huevo', 'yogur', 'yogurt', 'kumis', 'mantequilla', 'suero', 'cuajada', 'arequipe', 'crema de leche'],
  'Carnes y pollo': ['carne', 'pollo', 'cerdo', 'res', 'chorizo', 'salchicha', 'costilla', 'pechuga', 'molida', 'mortadela', 'jamon', 'tocino', 'chicharron', 'butifarra', 'higado', 'muslo'],
  'Snacks y dulces': ['papas', 'chitos', 'galleta', 'dulce', 'chicle', 'chocolatina', 'bombon', 'mani', 'platanito', 'detodito', 'gomita', 'golosina', 'snack', 'ponque', 'chocorramo', 'bocadillo'],
  'Aseo del hogar': ['jabon', 'detergente', 'cloro', 'blanqueador', 'fab', 'axion', 'escoba', 'trapero', 'limpido', 'suavizante', 'lavaloza', 'desinfectante', 'esponja', 'ambientador', 'bolsa de basura'],
  'Cuidado personal': ['shampoo', 'champu', 'crema dental', 'desodorante', 'toalla higienica', 'afeitadora', 'papel higienico', 'cepillo de dientes', 'jabon de bano', 'protector solar', 'panal', 'toallitas'],
  Frutas: ['banano', 'mango', 'pina', 'papaya', 'manzana', 'naranja', 'fresa', 'mandarina', 'guayaba', 'maracuya', 'lulo', 'uva', 'pera', 'patilla', 'melon', 'limon', 'aguacate', 'mora'],
  Verduras: ['tomate', 'cebolla', 'papa', 'zanahoria', 'lechuga', 'yuca', 'platano', 'ahuyama', 'pepino', 'pimenton', 'repollo', 'ajo', 'name', 'brocoli', 'habichuela'],
  'Hierbas y especias': ['cilantro', 'perejil', 'oregano', 'comino', 'laurel', 'tomillo', 'albahaca', 'cebollin'],
  Fritos: ['empanada', 'arepa', 'carimanola', 'bunuelo', 'frito', 'papa rellena', 'dedito', 'patacon', 'arepa de huevo', 'kibbe', 'quibbe'],
  Desayunos: ['desayuno', 'calentado', 'pericos', 'changua', 'caldo'],
  Sopas: ['sopa', 'sancocho', 'caldo', 'mondongo', 'ajiaco', 'crema de'],
  'Almuerzos del día': ['almuerzo', 'corrientazo', 'ejecutivo', 'menu del dia'],
  Hamburguesas: ['hamburguesa'],
  'Perros calientes': ['perro', 'hot dog'],
  Salchipapas: ['salchipapa'],
  Postres: ['postre', 'flan', 'tres leches', 'brownie', 'cheesecake', 'mousse', 'arroz con leche', 'enyucado', 'cocada'],
  Tortas: ['torta', 'ponque', 'pastel'],
  'Pasteles y tortas': ['torta', 'ponque', 'pastel'],
  Galletas: ['galleta', 'cookie'],
  Helados: ['helado', 'paleta', 'cono'],
  Malteadas: ['malteada', 'milkshake'],
  Cafés: ['cafe', 'tinto', 'capuchino', 'latte', 'expreso', 'espresso', 'americano', 'mocca', 'moca'],
  Jugos: ['jugo', 'limonada', 'zumo', 'natural'],
  'Jugos y batidos': ['jugo', 'batido', 'smoothie', 'limonada'],
  Batidos: ['batido', 'smoothie'],
  Panes: ['pan', 'mogolla', 'croissant', 'pandebono', 'almojabana', 'pan de bono', 'baguette', 'roscon'],
  'Panes y pasteles': ['pan', 'croissant', 'pandebono', 'almojabana', 'pastel', 'roscon'],
  Pescados: ['pescado', 'mojarra', 'pargo', 'robalo', 'bocachico', 'sierra', 'filete', 'salmon', 'corvina'],
  Mariscos: ['camaron', 'langosta', 'pulpo', 'calamar', 'mariscos', 'cazuela', 'ceviche', 'langostino'],
  Arroces: ['arroz con', 'arroz de', 'paella', 'arroz chino'],
  'Pollo asado': ['pollo asado', 'pollo broaster', 'pollo'],
  'Carnes asadas': ['carne asada', 'churrasco', 'punta de anca', 'costilla', 'chuleta', 'lomo'],
  Cócteles: ['coctel', 'mojito', 'margarita', 'pina colada', 'daiquiri', 'cuba libre', 'michelada'],
  'Para picar': ['picada', 'nachos', 'alitas', 'papas a la francesa', 'tabla', 'chicharron'],
  Cortes: ['corte', 'motilada', 'degradado', 'fade'],
  Barba: ['barba', 'afeitada', 'perfilado'],
  Cejas: ['ceja'],
  Color: ['tinte', 'color', 'mechas', 'rayitos', 'balayage', 'decoloracion', 'iluminacion'],
  Tratamientos: ['keratina', 'tratamiento', 'alisado', 'hidratacion', 'botox capilar', 'cepillado'],
  Manicure: ['manicure', 'unas de las manos'],
  Pedicure: ['pedicure', 'pies'],
  'Uñas acrílicas': ['acrilica', 'acrilico', 'semipermanente', 'press on', 'gel'],
  Masajes: ['masaje'],
  Celulares: ['celular', 'iphone', 'samsung', 'xiaomi', 'motorola', 'telefono'],
  'Cargadores y cables': ['cargador', 'cable', 'adaptador'],
  Audio: ['audifono', 'parlante', 'diadema', 'airpods', 'bafle'],
  Pantallas: ['pantalla', 'display', 'vidrio'],
  Baterías: ['bateria', 'pila'],
  Medicamentos: ['acetaminofen', 'ibuprofeno', 'dolex', 'advil', 'jarabe', 'pastilla', 'tableta', 'antibiotico', 'suero oral', 'medicamento'],
  Calzado: ['zapato', 'tenis', 'sandalia', 'chancla', 'bota', 'zapatilla', 'mocasin'],
  Camisetas: ['camiseta', 'polo', 'camisilla', 'esqueleto', 'top', 'crop top', 'tshirt', 't shirt'],
  'Camisas y blusas': ['camisa', 'blusa', 'guayabera', 'bluson'],
  Pantalones: ['pantalon', 'jean', 'bermuda', 'short', 'jogger', 'sudadera', 'falda', 'leggins', 'licra'],
  Vestidos: ['vestido', 'enterizo', 'jumpsuit', 'kimono'],
  'Ropa interior': ['boxer', 'brasier', 'panty', 'interior', 'media', 'calzoncillo', 'pijama', 'bikini', 'vestido de bano'],
  Accesorios: ['gorra', 'cinturon', 'correa', 'bolso', 'billetera', 'gafas', 'reloj', 'collar', 'arete', 'pulsera', 'sombrero', 'mochila'],
  // Insumos
  'Desechables y empaques': ['bolsa', 'vaso', 'plato desechable', 'servilleta', 'icopor', 'pitillo', 'empaque', 'caja', 'tapa', 'contenedor', 'papel aluminio', 'vinipel', 'cubierto', 'tenedor', 'cuchara', 'guante', 'tapabocas'],
  'Gas y carbón': ['gas', 'carbon', 'pipeta', 'cilindro', 'lena'],
  'Panes y masas': ['pan', 'masa', 'tortilla', 'arepa', 'pan de hamburguesa', 'pan de perro'],
  Harinas: ['harina', 'maizena', 'polvo de hornear', 'levadura'],
  'Salsas y condimentos': ['salsa', 'mayonesa', 'mostaza', 'ketchup', 'condimento', 'aji', 'adobo', 'sal', 'pimienta', 'triguisar', 'sazon'],
  Aceites: ['aceite', 'manteca'],
  'Café y té': ['cafe', 'te', 'aromatica', 'infusion'],
  'Chocolates y rellenos': ['chocolate', 'arequipe', 'mermelada', 'relleno', 'nutella', 'crema'],
  'Helados y bases': ['helado', 'base', 'mezcla'],
  Toppings: ['topping', 'chispa', 'granola', 'salsa de', 'sirope', 'm&m'],
  'Químicos y tintes': ['tinte', 'decolorante', 'oxigenta', 'peroxido', 'keratina', 'alisado', 'permanente', 'insecticida', 'veneno'],
  'Productos de aseo': ['jabon', 'cloro', 'detergente', 'desinfectante', 'limpido', 'ambientador', 'champu', 'shampoo'],
  'Aseo del local': ['jabon', 'cloro', 'escoba', 'trapero', 'detergente', 'desinfectante', 'limpido', 'recogedor', 'bolsa de basura'],
  'Lencería y toallas': ['toalla', 'sabana', 'almohada', 'cobija', 'funda', 'cortina'],
  Esmaltes: ['esmalte', 'quitaesmalte', 'top coat', 'base coat'],
  Herramientas: ['tijera', 'maquina', 'cuchilla', 'peine', 'cepillo', 'secador', 'plancha', 'destornillador', 'alicate', 'llave', 'martillo', 'taladro', 'lima'],
  'Repuestos y accesorios': ['repuesto', 'pieza', 'filtro', 'correa', 'bujia', 'rodamiento'],
  'Aceites y lubricantes': ['aceite de motor', 'lubricante', 'grasa', 'valvulina', 'liquido de frenos', 'refrigerante'],
  'Papel y tinta': ['papel', 'tinta', 'toner', 'cartucho', 'resma', 'hoja'],
  Combustible: ['gasolina', 'acpm', 'diesel', 'combustible'],
  'Insumos médicos': ['gasa', 'jeringa', 'algodon', 'alcohol', 'curita', 'esparadrapo', 'guante'],
  Amenities: ['jaboncito', 'shampoo', 'kit de aseo', 'gorro de bano'],
  'Plantas y abonos': ['planta', 'abono', 'tierra', 'semilla', 'fertilizante'],
};

/** ¿La palabra o frase `kw` aparece entera en `name` (los dos ya en `plain`), en singular o plural? */
function hasWord(name: string, kw: string): boolean {
  const words = name.split(' ');
  const target = kw.split(' ');
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, j) => sameWord(words[i + j], t))) return true;
  }
  return false;
}

/**
 * La sección más probable para `name` entre las del negocio (en su orden: la primera que coincide gana), o null.
 * Primero por el nombre de la sección («Hamburguesa doble» → Hamburguesas); después por el diccionario.
 */
export function suggestSection<T extends NamedSection>(name: string, sections: T[]): T | null {
  const n = plain(name);
  if (n.length < 2) return null;
  // 0) Frases del diccionario primero: «vestido de baño» es ropa interior, aunque diga «vestido».
  for (const s of sections) {
    const kws = KEYWORDS[s.name];
    if (kws?.some((kw) => kw.includes(' ') && hasWord(n, plain(kw)))) return s;
  }
  // 1) La palabra principal de la sección en el nombre: «hamburguesa» en «Hamburguesa doble».
  for (const s of sections) {
    const head = plain(s.name).split(' ')[0];
    if (head && head.length >= 4 && !STOP.has(head) && hasWord(n, head)) return s;
  }
  // 2) El diccionario.
  for (const s of sections) {
    const kws = KEYWORDS[s.name];
    if (kws?.some((kw) => hasWord(n, plain(kw)))) return s;
  }
  return null;
}
