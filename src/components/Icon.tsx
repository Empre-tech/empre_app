import { Ionicons as Fallback } from '@expo/vector-icons';
import type { ComponentProps, ComponentType } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * Los íconos de Empre (2026-11-13): Phosphor, trazo fino y redondeado como Iconly, con la versión rellena para lo
 * encendido. Se usa con los mismos nombres de Ionicons que ya tiene la app («home-outline», «heart»…): «-outline» es
 * la línea fina; sin «-outline», la forma rellena. Un nombre sin equivalente (p. ej. el ícono de una categoría que manda
 * el servidor) se dibuja con Ionicons, así nunca queda un hueco.
 */
type Weight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
type PhosphorIcon = ComponentType<{ size?: number; color?: string; weight?: Weight; style?: StyleProp<TextStyle> }>;

/* eslint-disable @typescript-eslint/no-require-imports */
// Cada ícono se carga por su archivo: así solo entran a la app los que se usan (Phosphor trae 1.500).
const pick = (m: Record<string, unknown>, name: string) => (m[name + 'Icon'] ?? m[name]) as PhosphorIcon;
const Airplane = pick(require('phosphor-react-native/src/icons/Airplane'), 'Airplane');
const Alarm = pick(require('phosphor-react-native/src/icons/Alarm'), 'Alarm');
const ArrowCircleDown = pick(require('phosphor-react-native/src/icons/ArrowCircleDown'), 'ArrowCircleDown');
const ArrowClockwise = pick(require('phosphor-react-native/src/icons/ArrowClockwise'), 'ArrowClockwise');
const ArrowDown = pick(require('phosphor-react-native/src/icons/ArrowDown'), 'ArrowDown');
const ArrowLeft = pick(require('phosphor-react-native/src/icons/ArrowLeft'), 'ArrowLeft');
const ArrowRight = pick(require('phosphor-react-native/src/icons/ArrowRight'), 'ArrowRight');
const ArrowSquareOut = pick(require('phosphor-react-native/src/icons/ArrowSquareOut'), 'ArrowSquareOut');
const ArrowUp = pick(require('phosphor-react-native/src/icons/ArrowUp'), 'ArrowUp');
const ArrowsDownUp = pick(require('phosphor-react-native/src/icons/ArrowsDownUp'), 'ArrowsDownUp');
const ArrowsLeftRight = pick(require('phosphor-react-native/src/icons/ArrowsLeftRight'), 'ArrowsLeftRight');
const ArrowsOut = pick(require('phosphor-react-native/src/icons/ArrowsOut'), 'ArrowsOut');
const At = pick(require('phosphor-react-native/src/icons/At'), 'At');
const Barbell = pick(require('phosphor-react-native/src/icons/Barbell'), 'Barbell');
const Bed = pick(require('phosphor-react-native/src/icons/Bed'), 'Bed');
const BeerBottle = pick(require('phosphor-react-native/src/icons/BeerBottle'), 'BeerBottle');
const Bell = pick(require('phosphor-react-native/src/icons/Bell'), 'Bell');
const Bicycle = pick(require('phosphor-react-native/src/icons/Bicycle'), 'Bicycle');
const Book = pick(require('phosphor-react-native/src/icons/Book'), 'Book');
const BookmarkSimple = pick(require('phosphor-react-native/src/icons/BookmarkSimple'), 'BookmarkSimple');
const Books = pick(require('phosphor-react-native/src/icons/Books'), 'Books');
const Buildings = pick(require('phosphor-react-native/src/icons/Buildings'), 'Buildings');
const CalendarBlank = pick(require('phosphor-react-native/src/icons/CalendarBlank'), 'CalendarBlank');
const CalendarCheck = pick(require('phosphor-react-native/src/icons/CalendarCheck'), 'CalendarCheck');
const Camera = pick(require('phosphor-react-native/src/icons/Camera'), 'Camera');
const Car = pick(require('phosphor-react-native/src/icons/Car'), 'Car');
const Cards = pick(require('phosphor-react-native/src/icons/Cards'), 'Cards');
const CaretDown = pick(require('phosphor-react-native/src/icons/CaretDown'), 'CaretDown');
const CaretLeft = pick(require('phosphor-react-native/src/icons/CaretLeft'), 'CaretLeft');
const CaretRight = pick(require('phosphor-react-native/src/icons/CaretRight'), 'CaretRight');
const CaretUp = pick(require('phosphor-react-native/src/icons/CaretUp'), 'CaretUp');
const ChartBar = pick(require('phosphor-react-native/src/icons/ChartBar'), 'ChartBar');
const ChartLineUp = pick(require('phosphor-react-native/src/icons/ChartLineUp'), 'ChartLineUp');
const ChatCenteredText = pick(require('phosphor-react-native/src/icons/ChatCenteredText'), 'ChatCenteredText');
const ChatCircle = pick(require('phosphor-react-native/src/icons/ChatCircle'), 'ChatCircle');
const ChatCircleDots = pick(require('phosphor-react-native/src/icons/ChatCircleDots'), 'ChatCircleDots');
const ChatsCircle = pick(require('phosphor-react-native/src/icons/ChatsCircle'), 'ChatsCircle');
const Check = pick(require('phosphor-react-native/src/icons/Check'), 'Check');
const CheckCircle = pick(require('phosphor-react-native/src/icons/CheckCircle'), 'CheckCircle');
const CheckSquare = pick(require('phosphor-react-native/src/icons/CheckSquare'), 'CheckSquare');
const Checks = pick(require('phosphor-react-native/src/icons/Checks'), 'Checks');
const Circle = pick(require('phosphor-react-native/src/icons/Circle'), 'Circle');
const Clock = pick(require('phosphor-react-native/src/icons/Clock'), 'Clock');
const CloudArrowUp = pick(require('phosphor-react-native/src/icons/CloudArrowUp'), 'CloudArrowUp');
const CloudSlash = pick(require('phosphor-react-native/src/icons/CloudSlash'), 'CloudSlash');
const Coffee = pick(require('phosphor-react-native/src/icons/Coffee'), 'Coffee');
const Copy = pick(require('phosphor-react-native/src/icons/Copy'), 'Copy');
const Cpu = pick(require('phosphor-react-native/src/icons/Cpu'), 'Cpu');
const CreditCard = pick(require('phosphor-react-native/src/icons/CreditCard'), 'CreditCard');
const Cube = pick(require('phosphor-react-native/src/icons/Cube'), 'Cube');
const DeviceMobile = pick(require('phosphor-react-native/src/icons/DeviceMobile'), 'DeviceMobile');
const Diamond = pick(require('phosphor-react-native/src/icons/Diamond'), 'Diamond');
const DotsNine = pick(require('phosphor-react-native/src/icons/DotsNine'), 'DotsNine');
const DotsThreeCircle = pick(require('phosphor-react-native/src/icons/DotsThreeCircle'), 'DotsThreeCircle');
const Drop = pick(require('phosphor-react-native/src/icons/Drop'), 'Drop');
const Eye = pick(require('phosphor-react-native/src/icons/Eye'), 'Eye');
const FileText = pick(require('phosphor-react-native/src/icons/FileText'), 'FileText');
const Fire = pick(require('phosphor-react-native/src/icons/Fire'), 'Fire');
const FirstAidKit = pick(require('phosphor-react-native/src/icons/FirstAidKit'), 'FirstAidKit');
const Flask = pick(require('phosphor-react-native/src/icons/Flask'), 'Flask');
const FloppyDisk = pick(require('phosphor-react-native/src/icons/FloppyDisk'), 'FloppyDisk');
const Flower = pick(require('phosphor-react-native/src/icons/Flower'), 'Flower');
const ForkKnife = pick(require('phosphor-react-native/src/icons/ForkKnife'), 'ForkKnife');
const Funnel = pick(require('phosphor-react-native/src/icons/Funnel'), 'Funnel');
const Gear = pick(require('phosphor-react-native/src/icons/Gear'), 'Gear');
const Gift = pick(require('phosphor-react-native/src/icons/Gift'), 'Gift');
const GitDiff = pick(require('phosphor-react-native/src/icons/GitDiff'), 'GitDiff');
const GraduationCap = pick(require('phosphor-react-native/src/icons/GraduationCap'), 'GraduationCap');
const Hamburger = pick(require('phosphor-react-native/src/icons/Hamburger'), 'Hamburger');
const Hammer = pick(require('phosphor-react-native/src/icons/Hammer'), 'Hammer');
const Handbag = pick(require('phosphor-react-native/src/icons/Handbag'), 'Handbag');
const Heart = pick(require('phosphor-react-native/src/icons/Heart'), 'Heart');
const Hourglass = pick(require('phosphor-react-native/src/icons/Hourglass'), 'Hourglass');
const House = pick(require('phosphor-react-native/src/icons/House'), 'House');
const IceCream = pick(require('phosphor-react-native/src/icons/IceCream'), 'IceCream');
const Image = pick(require('phosphor-react-native/src/icons/Image'), 'Image');
const Images = pick(require('phosphor-react-native/src/icons/Images'), 'Images');
const Info = pick(require('phosphor-react-native/src/icons/Info'), 'Info');
const Key = pick(require('phosphor-react-native/src/icons/Key'), 'Key');
const Laptop = pick(require('phosphor-react-native/src/icons/Laptop'), 'Laptop');
const Leaf = pick(require('phosphor-react-native/src/icons/Leaf'), 'Leaf');
const Lightbulb = pick(require('phosphor-react-native/src/icons/Lightbulb'), 'Lightbulb');
const Lightning = pick(require('phosphor-react-native/src/icons/Lightning'), 'Lightning');
const Link = pick(require('phosphor-react-native/src/icons/Link'), 'Link');
const List = pick(require('phosphor-react-native/src/icons/List'), 'List');
const Lock = pick(require('phosphor-react-native/src/icons/Lock'), 'Lock');
const MagnifyingGlass = pick(require('phosphor-react-native/src/icons/MagnifyingGlass'), 'MagnifyingGlass');
const MapPin = pick(require('phosphor-react-native/src/icons/MapPin'), 'MapPin');
const MapTrifold = pick(require('phosphor-react-native/src/icons/MapTrifold'), 'MapTrifold');
const Microphone = pick(require('phosphor-react-native/src/icons/Microphone'), 'Microphone');
const Minus = pick(require('phosphor-react-native/src/icons/Minus'), 'Minus');
const MinusCircle = pick(require('phosphor-react-native/src/icons/MinusCircle'), 'MinusCircle');
const Money = pick(require('phosphor-react-native/src/icons/Money'), 'Money');
const Moon = pick(require('phosphor-react-native/src/icons/Moon'), 'Moon');
const MusicNotes = pick(require('phosphor-react-native/src/icons/MusicNotes'), 'MusicNotes');
const NavigationArrow = pick(require('phosphor-react-native/src/icons/NavigationArrow'), 'NavigationArrow');
const PaintBrush = pick(require('phosphor-react-native/src/icons/PaintBrush'), 'PaintBrush');
const PaperPlaneRight = pick(require('phosphor-react-native/src/icons/PaperPlaneRight'), 'PaperPlaneRight');
const PaperPlaneTilt = pick(require('phosphor-react-native/src/icons/PaperPlaneTilt'), 'PaperPlaneTilt');
const Pause = pick(require('phosphor-react-native/src/icons/Pause'), 'Pause');
const PawPrint = pick(require('phosphor-react-native/src/icons/PawPrint'), 'PawPrint');
const PencilSimple = pick(require('phosphor-react-native/src/icons/PencilSimple'), 'PencilSimple');
const PencilSimpleLine = pick(require('phosphor-react-native/src/icons/PencilSimpleLine'), 'PencilSimpleLine');
const PersonSimpleWalk = pick(require('phosphor-react-native/src/icons/PersonSimpleWalk'), 'PersonSimpleWalk');
const Phone = pick(require('phosphor-react-native/src/icons/Phone'), 'Phone');
const Pizza = pick(require('phosphor-react-native/src/icons/Pizza'), 'Pizza');
const Play = pick(require('phosphor-react-native/src/icons/Play'), 'Play');
const Plus = pick(require('phosphor-react-native/src/icons/Plus'), 'Plus');
const PlusCircle = pick(require('phosphor-react-native/src/icons/PlusCircle'), 'PlusCircle');
const Pulse = pick(require('phosphor-react-native/src/icons/Pulse'), 'Pulse');
const QrCode = pick(require('phosphor-react-native/src/icons/QrCode'), 'QrCode');
const Question = pick(require('phosphor-react-native/src/icons/Question'), 'Question');
const Radio = pick(require('phosphor-react-native/src/icons/Radio'), 'Radio');
const RadioButton = pick(require('phosphor-react-native/src/icons/RadioButton'), 'RadioButton');
const Receipt = pick(require('phosphor-react-native/src/icons/Receipt'), 'Receipt');
const Repeat = pick(require('phosphor-react-native/src/icons/Repeat'), 'Repeat');
const Scan = pick(require('phosphor-react-native/src/icons/Scan'), 'Scan');
const Scissors = pick(require('phosphor-react-native/src/icons/Scissors'), 'Scissors');
const ShareNetwork = pick(require('phosphor-react-native/src/icons/ShareNetwork'), 'ShareNetwork');
const ShieldCheck = pick(require('phosphor-react-native/src/icons/ShieldCheck'), 'ShieldCheck');
const ShoppingCart = pick(require('phosphor-react-native/src/icons/ShoppingCart'), 'ShoppingCart');
const SignOut = pick(require('phosphor-react-native/src/icons/SignOut'), 'SignOut');
const SlidersHorizontal = pick(require('phosphor-react-native/src/icons/SlidersHorizontal'), 'SlidersHorizontal');
const SoccerBall = pick(require('phosphor-react-native/src/icons/SoccerBall'), 'SoccerBall');
const Sparkle = pick(require('phosphor-react-native/src/icons/Sparkle'), 'Sparkle');
const SpeakerHigh = pick(require('phosphor-react-native/src/icons/SpeakerHigh'), 'SpeakerHigh');
const SpeakerSlash = pick(require('phosphor-react-native/src/icons/SpeakerSlash'), 'SpeakerSlash');
const Square = pick(require('phosphor-react-native/src/icons/Square'), 'Square');
const SquaresFour = pick(require('phosphor-react-native/src/icons/SquaresFour'), 'SquaresFour');
const Star = pick(require('phosphor-react-native/src/icons/Star'), 'Star');
const StarHalf = pick(require('phosphor-react-native/src/icons/StarHalf'), 'StarHalf');
const Stop = pick(require('phosphor-react-native/src/icons/Stop'), 'Stop');
const Storefront = pick(require('phosphor-react-native/src/icons/Storefront'), 'Storefront');
const TShirt = pick(require('phosphor-react-native/src/icons/TShirt'), 'TShirt');
const Tag = pick(require('phosphor-react-native/src/icons/Tag'), 'Tag');
const TextT = pick(require('phosphor-react-native/src/icons/TextT'), 'TextT');
const ThumbsDown = pick(require('phosphor-react-native/src/icons/ThumbsDown'), 'ThumbsDown');
const ThumbsUp = pick(require('phosphor-react-native/src/icons/ThumbsUp'), 'ThumbsUp');
const Ticket = pick(require('phosphor-react-native/src/icons/Ticket'), 'Ticket');
const Toolbox = pick(require('phosphor-react-native/src/icons/Toolbox'), 'Toolbox');
const Trash = pick(require('phosphor-react-native/src/icons/Trash'), 'Trash');
const TrendUp = pick(require('phosphor-react-native/src/icons/TrendUp'), 'TrendUp');
const User = pick(require('phosphor-react-native/src/icons/User'), 'User');
const UserCircle = pick(require('phosphor-react-native/src/icons/UserCircle'), 'UserCircle');
const Users = pick(require('phosphor-react-native/src/icons/Users'), 'Users');
const Wallet = pick(require('phosphor-react-native/src/icons/Wallet'), 'Wallet');
const Warning = pick(require('phosphor-react-native/src/icons/Warning'), 'Warning');
const WarningCircle = pick(require('phosphor-react-native/src/icons/WarningCircle'), 'WarningCircle');
const WhatsappLogo = pick(require('phosphor-react-native/src/icons/WhatsappLogo'), 'WhatsappLogo');
const WifiHigh = pick(require('phosphor-react-native/src/icons/WifiHigh'), 'WifiHigh');
const Wine = pick(require('phosphor-react-native/src/icons/Wine'), 'Wine');
const Wrench = pick(require('phosphor-react-native/src/icons/Wrench'), 'Wrench');
const X = pick(require('phosphor-react-native/src/icons/X'), 'X');
const XCircle = pick(require('phosphor-react-native/src/icons/XCircle'), 'XCircle');
/* eslint-enable @typescript-eslint/no-require-imports */

const MAP: Record<string, PhosphorIcon> = {
  'add': Plus,
  'add-circle': PlusCircle,
  'airplane': Airplane,
  'alarm': Alarm,
  'albums': Cards,
  'alert': WarningCircle,
  'alert-circle': WarningCircle,
  'analytics': ChartLineUp,
  'arrow-back': ArrowLeft,
  'arrow-down': ArrowDown,
  'arrow-down-circle': ArrowCircleDown,
  'arrow-forward': ArrowRight,
  'arrow-up': ArrowUp,
  'at': At,
  'bag-handle': Handbag,
  'bar-chart': ChartBar,
  'bed': Bed,
  'beer': BeerBottle,
  'bicycle': Bicycle,
  'book': Book,
  'bookmark': BookmarkSimple,
  'brush': PaintBrush,
  'build': Wrench,
  'bulb': Lightbulb,
  'business': Buildings,
  'cafe': Coffee,
  'calendar': CalendarBlank,
  'call': Phone,
  'camera': Camera,
  'car': Car,
  'card': CreditCard,
  'cart': ShoppingCart,
  'cash': Money,
  'chatbox': ChatCenteredText,
  'chatbubble-ellipses': ChatCircleDots,
  'chatbubble': ChatCircle,
  'chatbubbles': ChatsCircle,
  'checkbox': CheckSquare,
  'checkmark': Check,
  'checkmark-circle': CheckCircle,
  'checkmark-done': Checks,
  'chevron-back': CaretLeft,
  'chevron-down': CaretDown,
  'chevron-forward': CaretRight,
  'chevron-up': CaretUp,
  'close': X,
  'close-circle': XCircle,
  'cloud-offline': CloudSlash,
  'cloud-upload': CloudArrowUp,
  'construct': Toolbox,
  'copy': Copy,
  'create': PencilSimpleLine,
  'cube': Cube,
  'cut': Scissors,
  'diamond': Diamond,
  'document-text': FileText,
  'ellipse': Circle,
  'ellipsis-horizontal-circle': DotsThreeCircle,
  'eye': Eye,
  'fast-food': Hamburger,
  'filter': Funnel,
  'fitness': Barbell,
  'flame': Fire,
  'flash': Lightning,
  'flask': Flask,
  'flower': Flower,
  'football': SoccerBall,
  'gift': Gift,
  'git-compare': GitDiff,
  'grid': SquaresFour,
  'hammer': Hammer,
  'hardware-chip': Cpu,
  'heart': Heart,
  'help-circle': Question,
  'home': House,
  'hourglass': Hourglass,
  'ice-cream': IceCream,
  'image': Image,
  'images': Images,
  'information': Info,
  'key': Key,
  'keypad': DotsNine,
  'laptop': Laptop,
  'leaf': Leaf,
  'library': Books,
  'link': Link,
  'list': List,
  'location': MapPin,
  'lock-closed': Lock,
  'log-out': SignOut,
  'logo-whatsapp': WhatsappLogo,
  'map': MapTrifold,
  'medkit': FirstAidKit,
  'menu': List,
  'mic': Microphone,
  'moon': Moon,
  'musical-notes': MusicNotes,
  'navigate': NavigationArrow,
  'notifications': Bell,
  'open': ArrowSquareOut,
  'options': SlidersHorizontal,
  'paper-plane': PaperPlaneTilt,
  'pause': Pause,
  'paw': PawPrint,
  'pencil': PencilSimple,
  'people': Users,
  'person': User,
  'person-circle': UserCircle,
  'phone-portrait': DeviceMobile,
  'pizza': Pizza,
  'play': Play,
  'pricetag': Tag,
  'pricetags': Tag,
  'pulse': Pulse,
  'qr-code': QrCode,
  'radio': Radio,
  'radio-button-off': Circle,
  'radio-button-on': RadioButton,
  'receipt': Receipt,
  'refresh': ArrowClockwise,
  'remove': Minus,
  'remove-circle': MinusCircle,
  'repeat': Repeat,
  'resize': ArrowsOut,
  'restaurant': ForkKnife,
  'save': FloppyDisk,
  'scan': Scan,
  'school': GraduationCap,
  'search': MagnifyingGlass,
  'send': PaperPlaneRight,
  'settings': Gear,
  'share': ShareNetwork,
  'shield-checkmark': ShieldCheck,
  'shirt': TShirt,
  'sparkles': Sparkle,
  'square': Square,
  'star': Star,
  'star-half': StarHalf,
  'stats-chart': ChartBar,
  'stop': Stop,
  'storefront': Storefront,
  'swap-horizontal': ArrowsLeftRight,
  'swap-vertical': ArrowsDownUp,
  'text': TextT,
  'thumbs-down': ThumbsDown,
  'thumbs-up': ThumbsUp,
  'ticket': Ticket,
  'time': Clock,
  'today': CalendarCheck,
  'trash': Trash,
  'trending-up': TrendUp,
  'volume-high': SpeakerHigh,
  'volume-mute': SpeakerSlash,
  'walk': PersonSimpleWalk,
  'wallet': Wallet,
  'warning': Warning,
  'water': Drop,
  'wifi': WifiHigh,
  'wine': Wine,
};

const FILLED = new Set<string>(['heart', 'star', 'star-half', 'bookmark', 'notifications', 'home', 'calendar', 'cafe', 'cube', 'flame', 'flash', 'sparkles', 'pricetag', 'pricetags', 'person', 'storefront', 'location', 'checkmark-circle', 'close-circle', 'alert-circle', 'alert', 'shield-checkmark', 'cash', 'card', 'image', 'images', 'analytics', 'stats-chart', 'qr-code', 'business', 'book', 'camera', 'mic', 'play', 'pause', 'stop', 'square', 'checkbox', 'information', 'warning', 'today', 'ticket', 'wallet', 'gift', 'people', 'chatbubble', 'chatbubbles', 'chatbubble-ellipses']);

type Props = ComponentProps<typeof Fallback>;

export function Ionicons({ name, size = 24, color, style, ...rest }: Props) {
  const raw = String(name);
  const base = raw.replace(/-(outline|sharp)$/, '');
  const Comp = MAP[base];
  if (!Comp) return <Fallback name={name} size={size} color={color} style={style} {...rest} />;
  const weight: Weight = !raw.endsWith('-outline') && FILLED.has(base) ? 'fill' : 'regular';
  return <Comp size={size} color={typeof color === 'string' ? color : undefined} weight={weight} style={style as StyleProp<TextStyle>} />;
}

/** Para los tipos que leen los nombres válidos (`keyof typeof Ionicons.glyphMap`). */
Ionicons.glyphMap = Fallback.glyphMap;
