import {
  AdfBlockNode,
  AdfDocNode,
  AdfInlineNode,
  AdfMark,
} from '../types/sideflow';
import { normalizeInlineNodes } from './adf';

export interface MisspellingMatch {
  /** The exact misspelled word as it appears in the text */
  word: string;
  /** Lowercase normalized form of the word */
  normalizedWord: string;
  /** Start character offset (inclusive) within the target string or inline block */
  start: number;
  /** End character offset (exclusive) within the target string or inline block */
  end: number;
  /** Ranked replacement suggestions preserving the original word's casing */
  suggestions: string[];
  /** Surrounding snippet for proofing UI preview */
  contextSnippet?: string;
  /** Optional target block identifier for Jira ADF blocks (e.g. "b-0", "b-1-li-0") */
  adfTargetId?: string;
  /** Optional human-readable location label */
  locationLabel?: string;
}

/**
 * Direct high-confidence lookup map of common English misspellings, keyboard
 * transpositions, and missing-apostrophe contractions (Chrome & Word parity).
 */
export const COMMON_TYPOS_MAP: Record<string, string[]> = {
  teh: ['the', 'ten', 'tea'],
  hte: ['the', 'ate', 'hat'],
  thn: ['then', 'than', 'thin'],
  tahn: ['than', 'then'],
  taht: ['that', 'taut'],
  thta: ['that'],
  waht: ['what', 'want'],
  hwat: ['what'],
  wiht: ['with', 'whit'],
  iwth: ['with'],
  fro: ['for', 'from', 'to'],
  form: ['form', 'from'],
  fomr: ['from', 'form'],
  rfom: ['from'],
  adn: ['and', 'add', 'any'],
  nad: ['and', 'nod'],
  ahve: ['have', 'hive'],
  hvae: ['have'],
  coudl: ['could', 'cloud'],
  woudl: ['would'],
  shoudl: ['should'],
  abotu: ['about'],
  baout: ['about'],
  becuase: ['because'],
  beacuse: ['because'],
  becasue: ['because'],
  recieve: ['receive'],
  recieved: ['received'],
  recieving: ['receiving'],
  reciever: ['receiver'],
  seperate: ['separate'],
  seperated: ['separated'],
  seperately: ['separately'],
  definately: ['definitely'],
  definitly: ['definitely'],
  definatly: ['definitely'],
  occured: ['occurred'],
  occuring: ['occurring'],
  occurence: ['occurrence'],
  accomodate: ['accommodate'],
  acommodate: ['accommodate'],
  acheive: ['achieve'],
  acheived: ['achieved'],
  acheivement: ['achievement'],
  adress: ['address'],
  adressed: ['addressed'],
  alot: ['a lot', 'allot'],
  amature: ['amateur'],
  appearence: ['appearance'],
  aparent: ['apparent'],
  apparantly: ['apparently'],
  arguement: ['argument'],
  arguements: ['arguments'],
  assasination: ['assassination'],
  basicly: ['basically'],
  begining: ['beginning'],
  beleive: ['believe'],
  beleived: ['believed'],
  buisness: ['business'],
  calender: ['calendar'],
  catagory: ['category'],
  cemetary: ['cemetery'],
  changeable: ['changeable'],
  cheif: ['chief'],
  collegue: ['colleague'],
  collegues: ['colleagues'],
  comming: ['coming'],
  commitee: ['committee'],
  completly: ['completely'],
  concious: ['conscious'],
  curiousity: ['curiosity'],
  decieve: ['deceive'],
  dependant: ['dependent'],
  desparate: ['desperate'],
  developement: ['development'],
  diffrent: ['different'],
  dilema: ['dilemma'],
  disapoint: ['disappoint'],
  disapointed: ['disappointed'],
  disapear: ['disappear'],
  embarass: ['embarrass'],
  embarassed: ['embarrassed'],
  enviroment: ['environment'],
  enviromental: ['environmental'],
  exagerate: ['exaggerate'],
  excellant: ['excellent'],
  existance: ['existence'],
  experiance: ['experience'],
  familar: ['familiar'],
  finaly: ['finally'],
  foriegn: ['foreign'],
  fourty: ['forty'],
  forseeable: ['foreseeable'],
  freind: ['friend'],
  freinds: ['friends'],
  futher: ['further'],
  garantee: ['guarantee'],
  garanteed: ['guaranteed'],
  goverment: ['government'],
  grammer: ['grammar'],
  happend: ['happened'],
  harrass: ['harass'],
  heighth: ['height'],
  humourous: ['humorous'],
  ignorance: ['ignorance'],
  immediatly: ['immediately'],
  incidental: ['incidental'],
  independant: ['independent'],
  indispensible: ['indispensable'],
  inoculate: ['inoculate'],
  inteligence: ['intelligence'],
  intresting: ['interesting'],
  interupt: ['interrupt'],
  irresistable: ['irresistible'],
  jstu: ['just'],
  jsut: ['just'],
  jugement: ['judgment', 'judgement'],
  knowlege: ['knowledge'],
  knwo: ['know', 'now'],
  konw: ['know'],
  liason: ['liaison'],
  libary: ['library'],
  lightening: ['lightning'],
  lisence: ['license'],
  maintainance: ['maintenance'],
  managment: ['management'],
  medeval: ['medieval'],
  memento: ['memento'],
  millenium: ['millennium'],
  miniscule: ['minuscule'],
  mispell: ['misspell'],
  mispelled: ['misspelled'],
  neccessary: ['necessary'],
  necesary: ['necessary'],
  neice: ['niece'],
  noticable: ['noticeable'],
  occassion: ['occasion'],
  occassional: ['occasional'],
  occassionally: ['occasionally'],
  oficial: ['official'],
  omision: ['omission'],
  oportunity: ['opportunity'],
  opurtunity: ['opportunity'],
  orignal: ['original'],
  outragous: ['outrageous'],
  parliment: ['parliament'],
  passtime: ['pastime'],
  percieve: ['perceive'],
  perseverance: ['perseverance'],
  persistant: ['persistent'],
  personel: ['personnel', 'personal'],
  plagarism: ['plagiarism'],
  playwright: ['playwright'],
  posession: ['possession'],
  potatos: ['potatoes'],
  preceed: ['precede'],
  prefered: ['preferred'],
  presense: ['presence'],
  priviledge: ['privilege'],
  probaly: ['probably'],
  probelm: ['problem'],
  promiss: ['promise'],
  pronounciation: ['pronunciation'],
  proofe: ['proof'],
  publik: ['public'],
  questionaire: ['questionnaire'],
  realy: ['really', 'relay'],
  realyl: ['really'],
  recomend: ['recommend'],
  recomended: ['recommended'],
  refered: ['referred'],
  referance: ['reference'],
  relavant: ['relevant'],
  religous: ['religious'],
  remeber: ['remember'],
  rember: ['remember'],
  repitition: ['repetition'],
  resistence: ['resistance'],
  responsability: ['responsibility'],
  restaraunt: ['restaurant'],
  rythm: ['rhythm'],
  scedule: ['schedule'],
  schedual: ['schedule'],
  secratary: ['secretary'],
  seige: ['siege'],
  senseable: ['sensible'],
  sergeant: ['sergeant'],
  sieze: ['seize'],
  similer: ['similar'],
  sincerly: ['sincerely'],
  speach: ['speech'],
  succesful: ['successful'],
  successfull: ['successful'],
  suceed: ['succeed'],
  supercede: ['supersede'],
  supress: ['suppress'],
  suprise: ['surprise'],
  suprised: ['surprised'],
  tatoo: ['tattoo'],
  tendancy: ['tendency'],
  therefor: ['therefore'],
  threshhold: ['threshold'],
  tomatos: ['tomatoes'],
  tommorow: ['tomorrow'],
  tomorow: ['tomorrow'],
  tounge: ['tongue'],
  truely: ['truly'],
  twelth: ['twelfth'],
  tyrany: ['tyranny'],
  underate: ['underrate'],
  unforseen: ['unforeseen'],
  unfortunatly: ['unfortunately'],
  untill: ['until'],
  upholstry: ['upholstery'],
  usally: ['usually'],
  useable: ['usable'],
  vaccum: ['vacuum'],
  vegatable: ['vegetable'],
  vehical: ['vehicle'],
  visable: ['visible'],
  wether: ['whether', 'weather'],
  weild: ['wield'],
  wierd: ['weird'],
  whereever: ['wherever'],
  wich: ['which', 'wish', 'with'],
  wirte: ['write'],
  writting: ['writing'],
  wriet: ['write'],
  yeild: ['yield'],
  yuo: ['you'],
  yuor: ['your'],
  yoru: ['your'],
  thier: ['their'],
  theri: ['their'],
  thsi: ['this'],
  tihs: ['this'],
  htis: ['this'],
  esle: ['else'],
  eles: ['else'],
  smoe: ['some', 'same'],
  soem: ['some'],
  tiem: ['time', 'item'],
  tmie: ['time'],
  liek: ['like', 'link'],
  lkie: ['like'],
  godo: ['good'],
  ogod: ['good'],
  wnat: ['want', 'what'],
  watn: ['want'],
  wokr: ['work'],
  owrk: ['work'],
  nwe: ['new', 'now'],
  onw: ['now', 'own', 'one'],
  hwo: ['how', 'who'],
  woh: ['who', 'how'],
  mkae: ['make'],
  amke: ['make'],
  tkae: ['take'],
  atke: ['take'],
  lsit: ['list'],
  nto: ['not', 'into'],
  ont: ['not', 'on'],
  cna: ['can'],
  acn: ['can'],
  alsp: ['also'],
  alos: ['also'],
  aslo: ['also'],
  veyr: ['very'],
  vrey: ['very'],
  onyl: ['only'],
  olny: ['only'],
  firstly: ['first'],
  dont: ["don't", 'font', 'done'],
  cant: ["can't", 'want', 'can'],
  wont: ["won't", 'want', 'went'],
  isnt: ["isn't"],
  arent: ["aren't"],
  wasnt: ["wasn't"],
  werent: ["weren't"],
  hasnt: ["hasn't"],
  havent: ["haven't"],
  hadnt: ["hadn't"],
  doesnt: ["doesn't"],
  didnt: ["didn't"],
  wouldnt: ["wouldn't"],
  shouldnt: ["shouldn't"],
  couldnt: ["couldn't"],
  youre: ["you're", 'your'],
  theyre: ["they're", 'there', 'their'],
  weve: ["we've", 'wave'],
  ive: ["I've", 'live', 'give'],
  im: ["I'm", 'in', 'am'],
  thats: ["that's", 'that'],
  whats: ["what's", 'what'],
  lets: ["let's", 'lets'],
};

/**
 * Core high-frequency English & software engineering vocabulary.
 * Combined with morphological stem rules (-s, -es, -ed, -ing, -ly, -er, -est,
 * -tion, -ment, -ness, -able, -ful, -less, un-, re-, pre-, non-, etc.).
 */
const RAW_BASE_WORDS = `
a abandon ability able about above abroad absence absent absolute accept access accident
accommodate accompany accomplish accord account accurate accuse achieve achievement acid
acknowledge acquire acquisition across act action active activity actor actual actually ad
adapt add addition additional address adequate adjust adjustment administration admire
admit adopt adult advance advanced advantage adventure advertise advice advise aesthetic
affair affect afford afraid after afternoon again against age agency agenda agent
aggressive ago agree agreement ahead aid aim air aircraft airline airport alarm album
alcohol alert alien align alignment alike alive all alliance allow allowance almost alone
along already also alter alternative although always amaze amazing ambition ambulance
amendment America American among amount analysis analyst analyze ancient and anger angle
angry animal anniversary announce annual another answer anticipate anxiety anxious any
anybody anymore anyone anything anyway anywhere apart apartment apologize app apparent
apparently appeal appear appearance apple application apply appoint appointment appreciate
approach appropriate approval approve approximately April arbitrary architect architecture
area argue argument arise arm armed army around arrange arrangement array arrest arrival
arrive art article artist artistic as ash Asian aside ask asleep aspect assault assert
assess assessment asset assign assignment assist assistance assistant associate association
assume assumption assure at athlete athletic atmosphere attach attachment attack attempt
attend attendance attention attitude attorney attract attractive attribute auction audience
audio audit August author authority auto automatic automatically available avenue average
avoid award aware awareness away awful baby back background backup backward bacteria bad
badly bag bake balance ball ban band bank bar barely bargain barrel barrier base baseball
basic basically basis basket basketball batch bath bathroom battery battle be beach
beam bean bear beard beast beat beautiful beauty because become bed bedroom beer before
begin beginning behavior behind being belief believe bell belong below belt bench bend
beneath benefit beside besides best bet better between beyond bias bicycle bid big bike
bill billion bin binary bind biological biology bird birth birthday bit bite black blade
blame blank blanket blind block blood blow blue board boat body boil boldly bomb bond bone
bonus book boom boost boot border bore born borrow boss both bother bottle bottom
bounce bound boundary bowl box boy boyfriend brain branch brand brave bread break
breakfast breast breath breathe breed brick bridge brief briefly bright brilliant bring
broad broadcast broken brother brown brush bubble bucket budget bug build builder building
bullet bunch bundle burden burn bury bus business busy but butter button buy buyer by
cabin cabinet cable cache cake calculate calculation calendar call camera camp campaign
campus can cancel cancer candidate candle canvas cap capability capable capacity capital
captain capture car carbon card care career careful carefully cargo carpet carrier carry
cart case cash cast castle cat catalog catch category cattle cause caution cave cease
celebrate celebration celebrity cell cemetery center central century ceremony certain
certainly certificate chain chair chairman challenge chamber champion championship chance
change channel chapter character characteristic characterize charge charity chart chase
chat cheap cheat check checkbox checklist cheek cheer cheese chef chemical chest chicken
chief child childhood chip chocolate choice choose Christian Christmas church cigarette
circle circuit circumstance cite citizen city civil civilian claim class classic
classification classify classroom clean clear clearly client climate climb clinic clinical
clip clock clone close closely closer clothes clothing cloud cluster coach coal coalition
coast coat code coding coffee cognitive coin cold collapse colleague collect collection
collective college colonial color colorful column combination combine come comedy comfort
comfortable command commander comment commercial commission commit commitment committee
common communicate communication community companion company compare comparison compel
compensate compensation compete competition competitive competitor complain complaint
complete completely completion complex complexity compliance component compose composition
comprehensive compress compute computer concentrate concentration concept concern
concerned concert conclude conclusion concrete condition conduct conference confidence
confident config configuration configure confirm conflict confront confusion congress
connect connection consciousness consensus consequence conservative consider considerable
considerably consideration consist consistent constant constantly constitute
constitution construct construction consultant consume consumer consumption contact
contain container contemporary content contest context continue continued contract
contrast contribute contribution control controller controversial controversy convenience
convention conventional conversation convert conviction convince cook cookie cool
cooperation cooperative coordinate coordinator cop cope copy core corn corner corporate
corporation correct correction correctly correlation correspond corridor cost cotton couch
could council count counter country county couple courage course court cousin cover
coverage cow crack craft crash crazy cream create creation creative creature credit crew
crime criminal crisis criteria critic critical criticism criticize crop cross crowd
crucial cry cultural culture cup curious current currently curriculum cursor curtain curve
custom customer customize cut cute cycle dad daily damage dance danger dangerous dare dark
darkness data database dataset date daughter dawn day dead deadline deal dealer dear death
debate debt decade decide decision deck declare decline decorate decrease dedicate
deep deeply deer default defeat defend defendant defense defensive deficit define
definitely definition degree delay delegate delete deliberate delicately deliver delivery
demand democracy democratic demonstrate demonstration deny department depend dependent
depending depict deploy deployment deposit depression depth deputy derive describe
description desert deserve design designer desire desk desktop despite destroy destruction
detail detailed detect detection determine develop developer development device devote
diagram dialogue diamond diary dictate dictation die diet differ difference different
differently difficult difficulty dig digital dimension dining dinner direct direction
directly director dirt dirty disable disabled disagree disappear disaster discipline
discourse discover discovery discrimination discuss discussion disease dish disk dismiss
disorder display dispute distance distant distinct distinction distinguish distribute
distribution district diverse diversity divide division divorce DNA do doctor document
documentation dog doll domain domestic dominant dominate donate donation done door double
doubt down download downtown dozen draft drag drama dramatic dramatically draw drawer
drawing dream dress dried drift drill drink drive driver drop drove drug dry duck due
during dust duty each eager early earn earnings earth ease easily east eastern easy eat
economic economics economist economy edge edit edition editor educate education
educational effect effective effectively efficiency efficient effort egg eight either
elderly elect election electric electricity electronic element elementary eliminate elite
else elsewhere email embrace emerge emergency emission emotion emotional emphasis
emphasize employ employee employer employment empty enable encounter encourage end enemy
energy enforcement engine engineer engineering English enhance enjoy enormous enough
ensure enter enterprise entertainment enthusiasm entire entirely entrance entry
environment environmental episode equal equally equipment era error escape especially
essay essential essentially establish establishment estate estimate etc ethics ethnic
European evaluate evaluation even evening event eventually ever every everybody everyday
everyone everything everywhere evidence evident evil evolution evolve exact exactly
examination examine example exceed excellent except exception exchange exciting executive
exercise exhibit exhibition exist existence existing exit expand expansion expect
expectation expense expensive experience experienced experiment experimental expert
explain explanation explicit explicitly explode explore explosion export expose exposure
express expression extend extension extensive extent external extra extraordinary extreme
extremely eye fabric face facility fact factor factory faculty fade fail failure fair
fairly faith fall false familiar family famous fan fancy fantasy far farm farmer fashion
fast faster fat fate father fault favor favorite fear feature federal fee feed feedback
feel feeling fellow female fence few fewer fiber fiction field fifteen fifth fifty fight
fighter fighting figure file fill film filter final finally finance financial find finding
fine finger finish fire firm first fiscal fish fishing fit fitness five fix fixed flag
flame flash flat flavor flee flesh flexible flight float floor flow flowchart flower fly
focus folk follow following food foot football for force foreign forest forever forget
forgive fork form format formation former formula forth fortunately fortune forward found
foundation founder four fourteen fourth fraction fragile frame framework free freedom
freeze French frequency frequent frequently fresh friend friendly friendship from front
fruit frustration fuel full fully fun function functional fund fundamental funding funeral
funny furniture furthermore future gain galaxy gallery game gang gap garage garden garlic
gas gate gather gay gaze gear gender gene general generally generate generation genetic
gentle gentleman gently genuine German gesture get ghost giant gift gifted girl girlfriend
give given glad glance glass global glove glow go goal God gold golden golf good
government governor grab grace grade gradually graduate grain grand grandfather
grandmother grant grass grave gray great greatest green grocery ground group grow growing
growth guarantee guard guess guest guide guideline guilty guitar gun guy habit habitat
hair half hall Halloween hammer hand handful handle hang happen happy hard hardly
hardware harm hat hate have he head headline headquarters health healthy hear hearing
heart heat heaven heavily heavy heel height helicopter hell hello help helpful her here
heritage hero herself hey hi hide high highlight highly highway hill him himself hip hire
his historian historic historical history hit hold holder hole holiday holy home homeless
honest honestly honey honor hook hope hopefully horizon hormone horn horrible horse
hospital host hot hotel hour house household housing hover how however huge human humor
hundred hungry hunter hunting hurt husband hypothesis I ice icon idea ideal identification
identify identity ie ignore ill illegal illness illustrate image imagination imagine
immediate immediately immigrant immigration impact implement implementation implication
imply import importance important impose impossible impress impression impressive improve
improvement in incentive incident include including income incorporate increase increased
increasing increasingly incredible indeed independence independent index Indian indicate
indication indicator individual industrial industry infant infection inflation influence
inform information ingredient initial initially initiative injury inner innocent input
inquiry insect insert inside insight insist inspire install installation instance instant
instantly instead institution institutional instruction instructor instrument insurance
intellectual intelligence intend intense intensity intention interaction interest
interested interesting interface interior internal international Internet interpret
interpretation intervention interview into introduce introduction invade invasion invest
investigate investigation investigator investment investor invite involve involved
involvement Iraqi Irish iron Islamic island Israeli issue it Italian item its itself
jacket jail Japanese jet Jew Jewish job join joint joke journal journalist journey joy
judge judgment juice jump junior jury just justice justify keep key keyboard kick kid kill
killer killing kind king kiss kitchen knee knife knock know knowledge lab label labor
laboratory lack lady lake land landscape language lap large largely laser last late later
Latin latter laugh launch law lawn lawsuit lawyer lay layer lead leader leadership leading
leaf league lean learn learning least leather leave Lebanese lecture left leg legal
legend legislation legitimate lemon length less lesson let letter level liberal library
license lid lie life lifestyle lifetime lift light lighting like likely limit limitation
limited line link lion lip liquid list listen listener literally literary literature
little live living load loan local locate location lock log logic logical long look loop
loose lose loss lost lot lots loud love lovely lover low lower luck lucky lunch lung
machine mad magazine magic mail main mainly maintain maintenance major majority make maker
makeup male mall man manage management manager manner manufacturer manufacturing many map
margin mark markdown market marketing marriage married marry mask mass massive master
match material math matter may maybe mayor me meal mean meaning meanwhile measure
measurement meat mechanism media medical medication medicine medium meet meeting melt
member membership memory mental mention menu mere merely merge mess message metal meter
method Mexican middle might military milk million mind mine minister ministry minor
minority minute miracle mirror miss missile mission mistake mix mixture mode model
moderate modern modest modify mom moment money monitor monkey month mood moon moral more
moreover morning mortgage most mostly mother motion motivate motivation motor mount
mountain mouse mouth move movement movie Mr Mrs Ms multiple murder muscle museum music
musical musician Muslim must mutual my myself mystery myth naked name narrative narrow
nation national native natural naturally nature near nearby nearly neat necessarily
necessary neck need negative negotiate negotiation neighbor neighborhood neither nerve
nervous net network neutral never nevertheless new newly news newspaper next nice night
nine no nobody nod noise nomination none nonetheless nor normal normally north northern
nose not note notebook nothing notice notion novel now nowhere nuclear number numerous
nurse nut object objective obligation observation observe observer obstacle obtain
obvious obviously occasion occasionally occupation occupy occur ocean odd odds of off
offense offensive offer office officer official often oh oil ok okay old Olympic on once
one ongoing onion online only onto open opening operate operating operation operator
opinion opponent opportunity oppose opposite opposition option or orange order ordinary
organic organization organize orientation origin original originally other others
otherwise ought our ourselves out outcome outdoor outer outlet outline output outside
over overall overcome overlook overnight oversee overwhelm owe own owner pace pack
package page pain painful paint painter painting pair pale Palestinian palm pan panel
pant paper parent park parking part participant participate participation particular
particularly partly partner partnership party pass passage passenger passion past patch
path patient pattern pause pay payment PC peace peak peer penalty pending people pepper
per perceive percentage perception performance perhaps period permanent permission permit
person personal personality personally personnel perspective persuade pet phase
phenomenon philosophy phone photo photograph photographer phrase physical physically
physician piano pick picture pie piece pile pilot pin pine pink pipe pitch place plan
plane planet planning plant plastic plate platform play player please pleasure plenty
plot plus PM pocket poem poet poetry point poke police policy political politically
politician politics poll pollution pool poor pop popular population porch port portion
portrait portray pose position positive possess possibility possible possibly post pot
potato potential potentially pound pour poverty powder power powerful practical practice
pray prayer precisely predict prefer preference pregnancy pregnant preparation prepare
prescription presence present preserve president presidential press pressure pretend
pretty prevent previous previously price pride priest primarily primary prime principal
principle print prior priority prison prisoner privacy private probably problem procedure
proceed process processing produce producer product production profession professional
professor profile profit program programmer programming progress project prominent
promise promote prompt proof proper properly property proportion proposal propose
proposed prosecutor prospect protect protection protein protest proud prove provide
provider province provision psychological psychologist psychology public publication
publicly publish publisher pull pulse pump punch punishment purchase pure purpose pursue
push put qualify quality quarter quarterback question quick quickly quiet quietly quit
quite quote rabbit race racial radar radiation radio rail railroad rain raise range rank
rapid rapidly rare rarely rate rather rating ratio raw reach react reaction read reader
reading ready real reality realize really reason reasonable recall receive recent
recently recipe recognition recognize recommend recommendation record recording recover
recovery recruit red reduce reduction refer reference reflect reflection reform refugee
regime region regional register regular regularly regulate regulation reinforce reject
relate relation relationship relative relatively relax release relevant relief religion
religious rely remain remaining remark remarkable remember remind remote remove render
repeat repeatedly replace replacement reply report reporter represent representation
representative republic Republican request require requirement rescue research
researcher resemble reservation resident resist resistance resolution resolve resort
resource respect respond respondent response responsibility responsible rest restaurant
restore restriction result retain retire retirement return reveal revenue review
revolutionize rhythm rice rich rid ride rifle right ring rise risk river road rock
role roll romantic roof room root rope rose rough roughly round route routine row rub
rule run running rural rush Russian sacred sad safe safety sake salad salary sale sales
salt same sample sanction sand satellite satisfaction satisfy sauce save saving say scale
scandal scared scenario schedule schema scholar scholarship school science scientific
scientist scope score scream screen script sea search season seat second secret secretary
section sector secure security see seed seek seem segment seize select selection self
sell senate senator send senior sense sensitive sentence separate sequence series serious
seriously servant serve server service session set setting settle settlement seven
several severe sex sexual shade shadow shake shall shape share sharp she sheet shelf
shell shelter shift shine ship shirt shock shoe shoot shooting shop shopping shore short
shortly shot should shoulder shout show shower shrug shut sick side sigh sight sign
signal significance significant significantly silence silent silver similar similarly
simple simply sin since sing singer single sink sir sister sit site situation six size
ski skill skin sky slave sleep slice slide slight slightly slip slow slowly small smart
smell smile smoke smooth snap snow so soak soccer social society soft software soil
solar soldier solid solution solve some somebody somehow someone something sometimes
somewhat somewhere son song soon sophisticated sorry sort soul sound soup source south
southern Soviet space Spanish speak speaker special specialist species specific
specifically specify spectrum speech speed spend spending sphere spin spirit spiritual
split spokesman sport spot spread spring squad square squeeze stability stable stack
staff stage stair stake stand standard standing star stare start starter state statement
station statistics status stay steady steal steel step stick still stir stock stomach
stone stop storage store storm story straight strange stranger strategy stream street
strength strengthen stress stretch strike string strip stroke strong strongly structure
struggle student studio study stuff style subject submit subsequent substance substantial
succeed success successful successfully such sudden suddenly sue suffer sufficient sugar
suggest suggestion suicide suit summer summit sun super supply support supporter suppose
supposed Supreme sure surely surface surgery surprise surprised surprising surprisingly
surround survey survival survive survivor suspect sustain swear sweep sweet swim swing
switch symbol symptom sync system table tablespoon tactic tail take tale talent talk
tall tank tap tape target task taste tax taxpayer tea teach teacher teaching team tear
teaspoon technical technique technology teen teenager telephone telescope television tell
temperature temporary ten tend tendency tennis tension tent term terms terrible territory
terror terrorism terrorist test testify testimony testing text textarea textbook thank
thanks that the theater their them theme themselves then theory therapy there therefore
these they thick thin thing think thinking third thirty this those though thought
thousand threat threaten three throat through throughout throw thus ticket tie tight time
timestamp tiny tip tire tired tissue title to tobacco today toe together tomato tomorrow
tone tongue tonight too tool tooth top topic toss total totally touch tough tour tourist
tournament toward towards tower town toy trace track trade tradition traditional traffic
tragedy trail train training transfer transform transformation transition translate
translation transport transportation trap trash travel treat treatment treaty tree
tremendous trend trial tribe trick trigger trim troop trouble truck true truly trust
truth try tube tunnel turn TV twelve twenty twice twin two type typical typically ugly
ultimate ultimately unable uncle under undergo understand understanding unfortunately
uniform union unique unit United universal universe university unknown unless unlike
unlikely until unusual up update upgrade upon upper urban urge us use used useful user
usual usually utility vacation valley valuable value variable variation variety various
vary vast vegetable vehicle venture version versus very vessel veteran via victim victory
video view viewer village violate violation violence violent virtually virtue virus
visible vision visit visitor visual vital voice volume volunteer vote voter vs vulnerable
wage wait wake walk wall wander want war warm warn warning wash waste watch water wave
way we weak wealth wealthy weapon wear weather wedding week weekend weekly weigh weight
welcome welfare well west western wet what whatever wheel when whenever where whereas
whether which while whisper white who whole whom whose why wide widely widespread wife
wild will willing win wind window wine wing winner winter wipe wire wisdom wise wish
with withdraw within without witness woman wonder wonderful wood wooden word work worker
working works workshop world worried worry worth would wound wrap write writer writing
written wrong yard yeah year yell yellow yes yesterday yet yield you young your yours
yourself youth zone zoom
jira atlassian confluence mermaid lucidchart sideflow objectdock whisper cuda sapi
webgpu typescript javascript python rust golang html css json yaml markdown adf wysiwyg
toolbar popover modal dropdown tooltip lozenge mention emoji subpanes scratchpad
monday tuesday wednesday thursday friday saturday sunday
january february march april may june july august september october november december
sprint backlog kanban scrum standup retro retrospective blocker ticket subtask epic
roadmap milestone frontend backend fullstack devops repo webhook endpoint payload
query mutation todo hotkey shortcut sidebar docklet minimap subgraph async await
boolean string number object array tuple enum interface class function const var
import export default return async promise callback listener handler component hook
props state ref effect memo context reducer router redux vite vitest electron
chromium browser window tray menu clipboard dialog notification toast badge pill
header footer navbar drawer canvas zoom pan grid layout column row cell border
padding margin shadow gradient opacity blur transition animation hover focus active
disabled checked selected expanded collapsed pinned unpinned untitled preview split
dictate dictating transcript transcription microphone loopback speaker channel
latency model engine local native hybrid offline online sync synced auto
`;

const IRREGULAR_WORDS = [
  'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'go', 'goes', 'went', 'going', 'gone',
  'say', 'says', 'said', 'saying',
  'make', 'makes', 'made', 'making',
  'know', 'knows', 'knew', 'knowing', 'known',
  'think', 'thinks', 'thought', 'thinking',
  'take', 'takes', 'took', 'taking', 'taken',
  'see', 'sees', 'saw', 'seeing', 'seen',
  'come', 'comes', 'came', 'coming',
  'want', 'wants', 'wanted', 'wanting',
  'look', 'looks', 'looked', 'looking',
  'use', 'uses', 'used', 'using',
  'find', 'finds', 'found', 'finding',
  'give', 'gives', 'gave', 'giving', 'given',
  'tell', 'tells', 'told', 'telling',
  'work', 'works', 'worked', 'working',
  'call', 'calls', 'called', 'calling',
  'try', 'tries', 'tried', 'trying',
  'ask', 'asks', 'asked', 'asking',
  'need', 'needs', 'needed', 'needing',
  'feel', 'feels', 'felt', 'feeling',
  'become', 'becomes', 'became', 'becoming',
  'leave', 'leaves', 'left', 'leaving',
  'put', 'puts', 'putting',
  'mean', 'means', 'meant', 'meaning',
  'keep', 'keeps', 'kept', 'keeping',
  'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'beginning', 'begun',
  'seem', 'seems', 'seemed', 'seeming',
  'help', 'helps', 'helped', 'helping',
  'talk', 'talks', 'talked', 'talking',
  'turn', 'turns', 'turned', 'turning',
  'start', 'starts', 'started', 'starting',
  'show', 'shows', 'showed', 'showing', 'shown',
  'hear', 'hears', 'heard', 'hearing',
  'play', 'plays', 'played', 'playing',
  'run', 'runs', 'ran', 'running',
  'move', 'moves', 'moved', 'moving',
  'live', 'lives', 'lived', 'living',
  'believe', 'believes', 'believed', 'believing',
  'hold', 'holds', 'held', 'holding',
  'bring', 'brings', 'brought', 'bringing',
  'happen', 'happens', 'happened', 'happening',
  'write', 'writes', 'wrote', 'writing', 'written',
  'provide', 'provides', 'provided', 'providing',
  'sit', 'sits', 'sat', 'sitting',
  'stand', 'stands', 'stood', 'standing',
  'lose', 'loses', 'lost', 'losing',
  'pay', 'pays', 'paid', 'paying',
  'meet', 'meets', 'met', 'meeting',
  'include', 'includes', 'included', 'including',
  'continue', 'continues', 'continued', 'continuing',
  'set', 'sets', 'setting',
  'learn', 'learns', 'learned', 'learnt', 'learning',
  'change', 'changes', 'changed', 'changing',
  'lead', 'leads', 'led', 'leading',
  'understand', 'understands', 'understood', 'understanding',
  'watch', 'watches', 'watched', 'watching',
  'follow', 'follows', 'followed', 'following',
  'stop', 'stops', 'stopped', 'stopping',
  'create', 'creates', 'created', 'creating',
  'speak', 'speaks', 'spoke', 'speaking', 'spoken',
  'read', 'reads', 'reading',
  'allow', 'allows', 'allowed', 'allowing',
  'add', 'adds', 'added', 'adding',
  'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'growing', 'grown',
  'open', 'opens', 'opened', 'opening',
  'walk', 'walks', 'walked', 'walking',
  'win', 'wins', 'won', 'winning',
  'offer', 'offers', 'offered', 'offering',
  'remember', 'remembers', 'remembered', 'remembering',
  'love', 'loves', 'loved', 'loving',
  'consider', 'considers', 'considered', 'considering',
  'appear', 'appears', 'appeared', 'appearing',
  'buy', 'buys', 'bought', 'buying',
  'wait', 'waits', 'waited', 'waiting',
  'serve', 'serves', 'served', 'serving',
  'die', 'dies', 'died', 'dying',
  'send', 'sends', 'sent', 'sending',
  'expect', 'expects', 'expected', 'expecting',
  'build', 'builds', 'built', 'building',
  'stay', 'stays', 'stayed', 'staying',
  'fall', 'falls', 'fell', 'falling', 'fallen',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reached', 'reaching',
  'kill', 'kills', 'killed', 'killing',
  'remain', 'remains', 'remained', 'remaining',
  'suggest', 'suggests', 'suggested', 'suggesting',
  'raise', 'raises', 'raised', 'raising',
  'pass', 'passes', 'passed', 'passing',
  'sell', 'sells', 'sold', 'selling',
  'require', 'requires', 'required', 'requiring',
  'report', 'reports', 'reported', 'reporting',
  'decide', 'decides', 'decided', 'deciding',
  'pull', 'pulls', 'pulled', 'pulling',
  'children', 'men', 'women', 'people', 'feet', 'teeth', 'mice', 'Criteria', 'criteria',
  'ping', 'artifact', 'artifacts', 'retro', 'retrospective', 'checklist',
  'webhook', 'webhooks', 'microservice', 'microservices', 'payload', 'payloads',
  'deployment', 'deployments', 'verify', 'acceptance',
  "don't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't",
  "hasn't", "haven't", "hadn't", "doesn't", "didn't", "wouldn't", "shouldn't",
  "couldn't", "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd",
  "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "that's", "what's", "where's", "who's", "how's", "let's", "there's", "here's",
];

// Build fast lookup structures once
const BASE_WORD_SET: Set<string> = new Set();
const BASE_WORD_LIST: string[] = [];

(() => {
  const tokens = RAW_BASE_WORDS.split(/\s+/);
  for (const raw of [...tokens, ...IRREGULAR_WORDS]) {
    const clean = raw.trim().toLowerCase();
    if (clean && /^[a-z']+$/.test(clean) && !BASE_WORD_SET.has(clean)) {
      BASE_WORD_SET.add(clean);
      BASE_WORD_LIST.push(clean);
    }
  }
  // Ensure all target words from COMMON_TYPOS_MAP are in BASE_WORD_SET
  for (const targets of Object.values(COMMON_TYPOS_MAP)) {
    for (const t of targets) {
      for (const part of t.toLowerCase().split(/\s+/)) {
        if (part && !BASE_WORD_SET.has(part)) {
          BASE_WORD_SET.add(part);
          BASE_WORD_LIST.push(part);
        }
      }
    }
  }
})();

const PREFIXES = [
  'un',
  're',
  'in',
  'im',
  'dis',
  'en',
  'non',
  'over',
  'mis',
  'sub',
  'pre',
  'inter',
  'fore',
  'de',
  'trans',
  'super',
  'semi',
  'anti',
  'mid',
  'under',
  'out',
  'co',
  'auto',
  'micro',
  'multi',
];

function isValidStemOrDerived(lower: string): boolean {
  if (BASE_WORD_SET.has(lower)) return true;

  // Possessive suffix ('s)
  if (lower.endsWith("'s") && lower.length > 3) {
    const base = lower.slice(0, -2);
    if (BASE_WORD_SET.has(base) || isValidInflection(base)) return true;
  }

  if (isValidInflection(lower)) return true;

  // Check common prefixes + valid root/inflection
  for (const pre of PREFIXES) {
    if (lower.startsWith(pre) && lower.length - pre.length >= 3) {
      const rest = lower.slice(pre.length);
      if (BASE_WORD_SET.has(rest) || isValidInflection(rest)) {
        return true;
      }
    }
  }

  return false;
}

function isValidInflection(word: string): boolean {
  if (BASE_WORD_SET.has(word)) return true;
  const len = word.length;
  if (len <= 3) return false;

  // -s, -es, -ies
  if (word.endsWith('ies') && len > 4) {
    if (BASE_WORD_SET.has(`${word.slice(0, -3)}y`)) return true;
  }
  if (word.endsWith('es') && len > 3) {
    const stem = word.slice(0, -2);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    const stem = word.slice(0, -1);
    if (BASE_WORD_SET.has(stem)) return true;
  }

  // -ed, -ied, doubled consonant + ed
  if (word.endsWith('ied') && len > 4) {
    if (BASE_WORD_SET.has(`${word.slice(0, -3)}y`)) return true;
  }
  if (word.endsWith('ed') && len > 3) {
    const stem = word.slice(0, -2);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      BASE_WORD_SET.has(stem.slice(0, -1))
    ) {
      return true;
    }
  }

  // -ing, doubled consonant + ing
  if (word.endsWith('ing') && len > 4) {
    const stem = word.slice(0, -3);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      BASE_WORD_SET.has(stem.slice(0, -1))
    ) {
      return true;
    }
  }

  // -ly, -ily
  if (word.endsWith('ily') && len > 4) {
    if (BASE_WORD_SET.has(`${word.slice(0, -3)}y`)) return true;
  }
  if (word.endsWith('ly') && len > 3) {
    const stem = word.slice(0, -2);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}le`)) return true;
  }

  // -er, -ers, -ier, -est, -iest
  if (word.endsWith('ier') && len > 4) {
    if (BASE_WORD_SET.has(`${word.slice(0, -3)}y`)) return true;
  }
  if (word.endsWith('iest') && len > 5) {
    if (BASE_WORD_SET.has(`${word.slice(0, -4)}y`)) return true;
  }
  if (word.endsWith('ers') && len > 4) {
    const stem = word.slice(0, -3);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
  }
  if (word.endsWith('er') && len > 3) {
    const stem = word.slice(0, -2);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      BASE_WORD_SET.has(stem.slice(0, -1))
    ) {
      return true;
    }
  }
  if (word.endsWith('est') && len > 4) {
    const stem = word.slice(0, -3);
    if (BASE_WORD_SET.has(stem) || BASE_WORD_SET.has(`${stem}e`)) return true;
  }

  // -ness, -ment, -ments, -ful, -fully, -less, -able, -ible, -tion, -tions, -ation
  const suffixes = [
    'nesses',
    'ness',
    'ments',
    'ment',
    'fully',
    'ful',
    'lessly',
    'less',
    'ables',
    'able',
    'ibles',
    'ible',
    'ations',
    'ation',
    'tions',
    'tion',
    'ings',
  ];
  for (const suf of suffixes) {
    if (word.endsWith(suf) && len - suf.length >= 3) {
      const stem = word.slice(0, -suf.length);
      if (
        BASE_WORD_SET.has(stem) ||
        BASE_WORD_SET.has(`${stem}e`) ||
        BASE_WORD_SET.has(`${stem}t`) ||
        (stem.endsWith('i') && BASE_WORD_SET.has(`${stem.slice(0, -1)}y`))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Applies the casing pattern of `sourceWord` (ALL CAPS, Title Case, or lower)
 * onto `suggestion`.
 */
export function matchWordCase(sourceWord: string, suggestion: string): string {
  if (!sourceWord || !suggestion) return suggestion;
  // Preserve explicit "I'm", "I've", "I'd", "I'll" capital I
  if (/^I(?:'[a-z]+)?$/.test(suggestion)) {
    if (sourceWord.length > 1 && sourceWord === sourceWord.toUpperCase()) {
      return suggestion.toUpperCase();
    }
    return suggestion;
  }
  if (sourceWord.length > 1 && sourceWord === sourceWord.toUpperCase()) {
    return suggestion.toUpperCase();
  }
  if (
    sourceWord[0] === sourceWord[0].toUpperCase() &&
    sourceWord.slice(1) === sourceWord.slice(1).toLowerCase()
  ) {
    return (
      suggestion.charAt(0).toUpperCase() + suggestion.slice(1).toLowerCase()
    );
  }
  if (sourceWord === sourceWord.toLowerCase()) {
    return suggestion.toLowerCase();
  }
  return suggestion;
}

/**
 * Checks whether a single word token is spelled correctly.
 * Ignores numbers, acronyms (ALL CAPS <= 5 chars), URLs, code identifiers,
 * and words in `customDictionary` or `ignoredWords`.
 */
export function isWordSpelledCorrectly(
  rawWord: string,
  customDictionary?: Iterable<string>,
  ignoredWords?: Iterable<string>
): boolean {
  const cleaned = rawWord.replace(/^['’]+|['’]+$/g, '').trim();
  if (cleaned.length <= 1) return true;

  // Ignore numeric / ordinal / version tokens
  if (/\d/.test(cleaned)) return true;

  // Normalize curly apostrophes to straight apostrophe
  const normalized = cleaned.replace(/’/g, "'");
  const lower = normalized.toLowerCase();

  // Check user custom dictionary & session ignored words first
  if (customDictionary) {
    for (const w of customDictionary) {
      if (w.trim().toLowerCase() === lower) return true;
    }
  }
  if (ignoredWords) {
    for (const w of ignoredWords) {
      if (w.trim().toLowerCase() === lower) return true;
    }
  }

  // Known common typos are always flagged even if short or ALL CAPS
  if (Object.prototype.hasOwnProperty.call(COMMON_TYPOS_MAP, lower)) {
    return false;
  }

  // Ignore short ALL-CAPS acronyms (e.g. API, JSON, WCAG, HTML, SDK, UI, UX)
  if (
    normalized.length >= 2 &&
    normalized.length <= 5 &&
    normalized === normalized.toUpperCase() &&
    /^[A-Z]+$/.test(normalized)
  ) {
    return true;
  }

  // Ignore camelCase / PascalCase code identifiers (e.g., useState, SideFlow, JiraAdfEditor)
  if (/^[a-z]+[A-Z][a-zA-Z]*$/.test(normalized)) {
    return true;
  }
  if (/^[A-Z][a-z]+[A-Z][a-zA-Z]*$/.test(normalized)) {
    return true;
  }

  // Hyphenated compound words: valid if every segment is valid
  if (lower.includes('-')) {
    const parts = lower.split('-').filter(Boolean);
    return parts.every((p) =>
      isWordSpelledCorrectly(p, customDictionary, ignoredWords)
    );
  }

  return isValidStemOrDerived(lower);
}

/**
 * Computes Damerau-Levenshtein distance (optimal string alignment) between `a` and `b`,
 * treating adjacent character transpositions (e.g., "teh" -> "the") as distance 1.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 2) return 3;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return dp[lenA][lenB];
}

const MAX_SUGGESTION_CACHE_ENTRIES = 256;
const suggestionRankingCache = new Map<string, string[]>();

/**
 * Generates up to `maxSuggestions` ranked spelling suggestions for `rawWord`,
 * merging direct common typo mappings, Damerau-Levenshtein candidates, and
 * optional native Electron Hunspell suggestions.
 */
export function getSpellingSuggestions(
  rawWord: string,
  options?: {
    maxSuggestions?: number;
    customDictionary?: Iterable<string>;
    nativeSuggestions?: string[];
  }
): string[] {
  const maxSuggestions = options?.maxSuggestions ?? 5;
  const cleaned = rawWord.replace(/^['’]+|['’]+$/g, '').trim();
  if (!cleaned) return [];

  const normalized = cleaned.replace(/’/g, "'");
  const lower = normalized.toLowerCase();
  const customList = options?.customDictionary
    ? Array.from(options.customDictionary)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const nativeList = options?.nativeSuggestions
    ? options.nativeSuggestions.map((w) => w.trim()).filter(Boolean)
    : [];

  const cacheKey = `${cleaned}|${maxSuggestions}|${customList.join(',')}|${nativeList.join(',')}`;
  const cached = suggestionRankingCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  const results: string[] = [];
  const seenLower = new Set<string>();

  const pushCandidate = (cand: string) => {
    const cLower = cand.toLowerCase();
    if (!cLower || cLower === lower || seenLower.has(cLower)) return;
    seenLower.add(cLower);
    results.push(matchWordCase(cleaned, cand));
  };

  // 1. Native Electron Hunspell suggestions (if provided by OS/Chromium)
  for (const nat of nativeList) {
    pushCandidate(nat);
  }

  // 2. Direct Common Typos & Contractions Table
  const directMatches = COMMON_TYPOS_MAP[lower];
  if (directMatches) {
    for (const m of directMatches) {
      pushCandidate(m);
    }
  }

  if (results.length >= maxSuggestions) {
    const finalResults = results.slice(0, maxSuggestions);
    if (suggestionRankingCache.size >= MAX_SUGGESTION_CACHE_ENTRIES) {
      const oldestKey = suggestionRankingCache.keys().next().value;
      if (oldestKey !== undefined) suggestionRankingCache.delete(oldestKey);
    }
    suggestionRankingCache.set(cacheKey, finalResults);
    return finalResults;
  }

  // 3. Check if adjacent transposition of any two characters yields a valid word
  for (let i = 0; i < lower.length - 1; i++) {
    const swapped =
      lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2);
    if (swapped !== lower && isValidStemOrDerived(swapped)) {
      pushCandidate(swapped);
    }
  }

  // 4. Damerau-Levenshtein search across BASE_WORD_LIST + customDictionary
  const scored: Array<{ word: string; score: number }> = [];
  const maxEditDist = lower.length <= 4 ? 1 : 2;

  const evaluateCandidate = (cand: string, isCustom: boolean) => {
    if (!cand || seenLower.has(cand) || cand === lower) return;
    if (Math.abs(cand.length - lower.length) > maxEditDist) return;
    const dist = damerauLevenshtein(lower, cand);
    if (dist > maxEditDist) return;

    // Lower score is better: prioritize distance 1, matching first character, matching last character, and similar length
    let score = dist * 10;
    if (cand[0] !== lower[0]) score += 4;
    if (cand[cand.length - 1] !== lower[lower.length - 1]) score += 2;
    score += Math.abs(cand.length - lower.length);
    if (isCustom) score -= 3;
    scored.push({ word: cand, score });
  };

  for (const cw of customList) {
    evaluateCandidate(cw, true);
  }
  for (const bw of BASE_WORD_LIST) {
    evaluateCandidate(bw, false);
  }

  scored.sort((a, b) => a.score - b.score);
  for (const item of scored) {
    pushCandidate(item.word);
    if (results.length >= maxSuggestions) break;
  }

  const finalResults = results.slice(0, maxSuggestions);
  if (suggestionRankingCache.size >= MAX_SUGGESTION_CACHE_ENTRIES) {
    const oldestKey = suggestionRankingCache.keys().next().value;
    if (oldestKey !== undefined) suggestionRankingCache.delete(oldestKey);
  }
  suggestionRankingCache.set(cacheKey, finalResults);
  return finalResults;
}

/**
 * Computes masked intervals in Markdown text that should be skipped by spellcheck:
 * - Fenced code blocks (``` ... ```)
 * - Inline code (`...`)
 * - Markdown link URLs ([text](url)) and bare http(s)/mailto URLs
 * - Email addresses
 * - Timestamp badges ([10:30 AM])
 * - Hashtags (#tag) and @mentions (@user)
 */
function buildMarkdownSkipRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const patterns = [
    /```[\s\S]*?```/g, // fenced code blocks
    /`[^`\n]+`/g, // inline code
    /\]\([^)\n]+\)/g, // markdown link target URL
    /\b(?:https?:\/\/|mailto:|www\.)[^\s<>()]+/gi, // bare URLs
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // emails
    /\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?\]/g, // timestamps
    /(?:^|\s)[#@][a-zA-Z0-9_.-]+/g, // #tags and @mentions
  ];

  for (const regex of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isRangeInsideSkip(
  start: number,
  end: number,
  skipRanges: Array<[number, number]>
): boolean {
  for (const [s, e] of skipRanges) {
    if (start < e && end > s) return true;
  }
  return false;
}

/**
 * Extracts the word token at `cursorIndex` within `text` (used when right-clicking
 * in a `<textarea>`, `<input>`, or `contentEditable` text block).
 */
export function getWordAtCharacterOffset(
  text: string,
  cursorIndex: number,
  options?: { isMarkdown?: boolean }
): { word: string; start: number; end: number } | null {
  if (!text) return null;
  const clamped = Math.max(0, Math.min(cursorIndex, text.length));

  if (options?.isMarkdown) {
    const skipRanges = buildMarkdownSkipRanges(text);
    if (isRangeInsideSkip(clamped, clamped + 1, skipRanges)) {
      return null;
    }
  }

  const isWordChar = (ch: string) => /[A-Za-z'’]/.test(ch);

  // Find word around clamped index
  let probe = clamped;
  if (probe < text.length && !isWordChar(text[probe])) {
    if (probe > 0 && isWordChar(text[probe - 1])) {
      probe -= 1;
    } else {
      return null;
    }
  } else if (probe === text.length && probe > 0 && isWordChar(text[probe - 1])) {
    probe -= 1;
  }

  if (probe < 0 || probe >= text.length || !isWordChar(text[probe])) {
    return null;
  }

  let start = probe;
  while (start > 0 && isWordChar(text[start - 1])) {
    start -= 1;
  }
  let end = probe + 1;
  while (end < text.length && isWordChar(text[end])) {
    end += 1;
  }

  // Trim leading/trailing apostrophes
  while (start < end && (text[start] === "'" || text[start] === '’')) {
    start += 1;
  }
  while (end > start && (text[end - 1] === "'" || text[end - 1] === '’')) {
    end -= 1;
  }

  if (end <= start) return null;
  return {
    word: text.slice(start, end),
    start,
    end,
  };
}

/**
 * Scans plain or Markdown text and returns all misspelled words with their exact
 * `[start, end]` character offsets and top replacement suggestions.
 */
export function findMisspellingsInText(
  text: string,
  options?: {
    isMarkdown?: boolean;
    customDictionary?: Iterable<string>;
    ignoredWords?: Iterable<string>;
    maxMatches?: number;
  }
): MisspellingMatch[] {
  if (!text || !text.trim()) return [];
  const skipRanges = options?.isMarkdown ? buildMarkdownSkipRanges(text) : [];
  const maxMatches = options?.maxMatches ?? 100;
  const matches: MisspellingMatch[] = [];
  const wordRegex = /\b[A-Za-z]+(?:['’][A-Za-z]+)*\b/g;

  let m: RegExpExecArray | null;
  while ((m = wordRegex.exec(text)) !== null) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;

    if (skipRanges.length > 0 && isRangeInsideSkip(start, end, skipRanges)) {
      continue;
    }

    if (
      !isWordSpelledCorrectly(
        word,
        options?.customDictionary,
        options?.ignoredWords
      )
    ) {
      const ctxStart = Math.max(0, start - 18);
      const ctxEnd = Math.min(text.length, end + 18);
      const prefixEllipsis = ctxStart > 0 ? '…' : '';
      const suffixEllipsis = ctxEnd < text.length ? '…' : '';
      const contextSnippet = `${prefixEllipsis}${text
        .slice(ctxStart, ctxEnd)
        .replace(/\s+/g, ' ')}${suffixEllipsis}`;

      matches.push({
        word,
        normalizedWord: word.replace(/’/g, "'").toLowerCase(),
        start,
        end,
        suggestions: getSpellingSuggestions(word, {
          customDictionary: options?.customDictionary,
        }),
        contextSnippet,
      });

      if (matches.length >= maxMatches) break;
    }
  }

  return matches;
}

/**
 * Extracts plain text from an `AdfInlineNode[]` array where atomic inline widgets
 * and `hardBreak` nodes occupy 1 space character (matching `getInlineSelectionOffsets`),
 * and collects character intervals belonging to `code` or `link` marks so they are
 * skipped during spellcheck.
 */
export function getInlineNodesSpellcheckSurface(nodes?: AdfInlineNode[]): {
  plainText: string;
  skipRanges: Array<[number, number]>;
} {
  if (!nodes || nodes.length === 0) {
    return { plainText: '', skipRanges: [] };
  }
  let plainText = '';
  const skipRanges: Array<[number, number]> = [];

  for (const node of nodes) {
    const startOffset = plainText.length;
    if (node.type === 'text') {
      plainText += node.text;
      const hasCodeOrLink = (node.marks || []).some(
        (mk) => mk.type === 'code' || mk.type === 'link'
      );
      if (hasCodeOrLink) {
        skipRanges.push([startOffset, plainText.length]);
      }
    } else {
      plainText += ' ';
      skipRanges.push([startOffset, startOffset + 1]);
    }
  }

  // Also skip bare URLs, emails, and @mentions inside regular text nodes
  const urlOrMentionRegex =
    /\b(?:https?:\/\/|mailto:|www\.)[^\s<>()]+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|(?:^|\s)[#@][a-zA-Z0-9_.-]+/gi;
  let m: RegExpExecArray | null;
  while ((m = urlOrMentionRegex.exec(plainText)) !== null) {
    skipRanges.push([m.index, m.index + m[0].length]);
  }

  return { plainText, skipRanges };
}

/**
 * Replaces the character range `[start, end]` inside `nodes` with `replacementText`,
 * preserving any existing `AdfMark[]` on the text node where the word started!
 */
export function replaceWordInAdfInlineNodes(
  nodes: AdfInlineNode[] | undefined,
  start: number,
  end: number,
  replacementText: string
): { content: AdfInlineNode[]; nextOffset: number } {
  const source = nodes || [];
  let cursor = 0;
  let inheritedMarks: AdfMark[] | undefined;

  for (const n of source) {
    const len = n.type === 'text' ? n.text.length : 1;
    if (start >= cursor && start < cursor + len && n.type === 'text') {
      inheritedMarks = n.marks ? [...n.marks] : undefined;
      break;
    }
    cursor += len;
  }

  const out: AdfInlineNode[] = [];
  let pos = 0;
  let inserted = false;

  const insertReplacement = () => {
    if (inserted) return;
    inserted = true;
    if (replacementText.length > 0) {
      out.push({
        type: 'text',
        text: replacementText,
        ...(inheritedMarks && inheritedMarks.length > 0
          ? { marks: inheritedMarks }
          : {}),
      });
    }
  };

  for (const n of source) {
    const len = n.type === 'text' ? n.text.length : 1;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    pos = nodeEnd;

    if (nodeEnd <= start) {
      out.push(n);
      continue;
    }
    if (nodeStart >= end) {
      insertReplacement();
      out.push(n);
      continue;
    }

    if (n.type === 'text') {
      const beforeCount = Math.max(0, start - nodeStart);
      const afterOffset = Math.max(0, end - nodeStart);
      const beforeSlice = n.text.slice(0, beforeCount);
      const afterSlice = n.text.slice(afterOffset);

      if (beforeSlice.length > 0) {
        out.push({ ...n, text: beforeSlice });
      }
      insertReplacement();
      if (afterSlice.length > 0) {
        out.push({ ...n, text: afterSlice });
      }
    } else {
      insertReplacement();
    }
  }

  insertReplacement();

  return {
    content: normalizeInlineNodes(out),
    nextOffset: start + replacementText.length,
  };
}

/**
 * Scans an entire `AdfDocNode` for misspelled words across all rich inline blocks
 * (paragraphs, headings, lists, task items, decision items, panels, blockquotes,
 * expand sections, tables, and layouts), ignoring `codeBlock` nodes and inline code.
 */
export function findMisspellingsInAdfDoc(
  doc: AdfDocNode,
  options?: {
    customDictionary?: Iterable<string>;
    ignoredWords?: Iterable<string>;
    maxMatches?: number;
  }
): MisspellingMatch[] {
  const matches: MisspellingMatch[] = [];
  const maxMatches = options?.maxMatches ?? 100;

  const scanInline = (
    nodes: AdfInlineNode[] | undefined,
    targetId: string,
    locationLabel: string
  ) => {
    if (matches.length >= maxMatches) return;
    const { plainText, skipRanges } = getInlineNodesSpellcheckSurface(nodes);
    if (!plainText.trim()) return;

    const wordRegex = /\b[A-Za-z]+(?:['’][A-Za-z]+)*\b/g;
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(plainText)) !== null) {
      const word = m[0];
      const start = m.index;
      const end = start + word.length;
      if (isRangeInsideSkip(start, end, skipRanges)) continue;

      if (
        !isWordSpelledCorrectly(
          word,
          options?.customDictionary,
          options?.ignoredWords
        )
      ) {
        const ctxStart = Math.max(0, start - 18);
        const ctxEnd = Math.min(plainText.length, end + 18);
        const contextSnippet = `${ctxStart > 0 ? '…' : ''}${plainText
          .slice(ctxStart, ctxEnd)
          .replace(/\s+/g, ' ')}${ctxEnd < plainText.length ? '…' : ''}`;

        matches.push({
          word,
          normalizedWord: word.replace(/’/g, "'").toLowerCase(),
          start,
          end,
          suggestions: getSpellingSuggestions(word, {
            customDictionary: options?.customDictionary,
          }),
          contextSnippet,
          adfTargetId: targetId,
          locationLabel,
        });
        if (matches.length >= maxMatches) return;
      }
    }
  };

  const walkNestedBlocks = (
    blocks: AdfBlockNode[],
    prefix: string,
    labelPrefix: string
  ) => {
    blocks.forEach((b, sIdx) => {
      const subId = `${prefix}-${sIdx}`;
      if (b.type === 'paragraph' || b.type === 'heading') {
        scanInline(b.content, subId, labelPrefix);
      } else if (b.type === 'bulletList' || b.type === 'orderedList') {
        b.content.forEach((li, liIdx) => {
          const first = li.content[0];
          if (first && first.type === 'paragraph') {
            scanInline(
              first.content,
              `${subId}-li-${liIdx}`,
              `${labelPrefix} • List`
            );
          }
        });
      }
    });
  };

  doc.content.forEach((block, idx) => {
    const baseId = `b-${idx}`;
    switch (block.type) {
      case 'paragraph':
        scanInline(block.content, baseId, `Paragraph ${idx + 1}`);
        break;
      case 'heading':
        scanInline(
          block.content,
          baseId,
          `Heading H${block.attrs.level} (${idx + 1})`
        );
        break;
      case 'bulletList':
      case 'orderedList':
        block.content.forEach((li, liIdx) => {
          const first = li.content[0];
          if (first && first.type === 'paragraph') {
            scanInline(
              first.content,
              `${baseId}-li-${liIdx}`,
              `List item ${liIdx + 1}`
            );
          }
          li.content.slice(1).forEach((nested, nIdx) => {
            if (nested.type === 'bulletList' || nested.type === 'orderedList') {
              walkNestedBlocks(
                [nested],
                `${baseId}-li-${liIdx}-sub-${nIdx}`,
                `Nested list`
              );
            }
          });
        });
        break;
      case 'taskList':
        block.content.forEach((item, tIdx) => {
          if (item.type === 'taskItem') {
            scanInline(
              item.content,
              `${baseId}-task-${tIdx}`,
              `Action item ${tIdx + 1}`
            );
          }
        });
        break;
      case 'decisionList':
        block.content.forEach((dec, dIdx) => {
          scanInline(
            dec.content,
            `${baseId}-dec-${dIdx}`,
            `Decision ${dIdx + 1}`
          );
        });
        break;
      case 'panel':
        walkNestedBlocks(
          block.content,
          `${baseId}-panel`,
          `${block.attrs.panelType.toUpperCase()} Panel`
        );
        break;
      case 'blockquote':
        walkNestedBlocks(block.content, `${baseId}-quote`, 'Quote');
        break;
      case 'expand':
      case 'nestedExpand':
        walkNestedBlocks(block.content, `${baseId}-expand`, 'Expand');
        break;
      case 'table':
        block.content.forEach((row, rIdx) => {
          row.content.forEach((cell, cIdx) => {
            walkNestedBlocks(
              cell.content,
              `${baseId}-r${rIdx}-c${cIdx}`,
              `Table R${rIdx + 1}C${cIdx + 1}`
            );
          });
        });
        break;
      case 'layoutSection':
        block.content.forEach((col, colIdx) => {
          walkNestedBlocks(
            col.content,
            `${baseId}-col${colIdx}`,
            `Column ${colIdx + 1}`
          );
        });
        break;
      default:
        break;
    }
  });

  return matches;
}

/**
 * Replaces all occurrences of `targetLowerWord` with `replacementWord` (matching each
 * occurrence's capitalization) across a Markdown string, skipping code blocks and URLs.
 */
export function replaceAllWordOccurrencesInText(
  text: string,
  targetLowerWord: string,
  replacementWord: string,
  options?: { isMarkdown?: boolean }
): { nextText: string; replacedCount: number } {
  const skipRanges = options?.isMarkdown ? buildMarkdownSkipRanges(text) : [];
  const wordRegex = /\b[A-Za-z]+(?:['’][A-Za-z]+)*\b/g;
  let result = '';
  let lastIndex = 0;
  let replacedCount = 0;

  let m: RegExpExecArray | null;
  while ((m = wordRegex.exec(text)) !== null) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    if (skipRanges.length > 0 && isRangeInsideSkip(start, end, skipRanges)) {
      continue;
    }
    if (word.replace(/’/g, "'").toLowerCase() === targetLowerWord.toLowerCase()) {
      result += text.slice(lastIndex, start);
      result += matchWordCase(word, replacementWord);
      lastIndex = end;
      replacedCount += 1;
    }
  }

  if (replacedCount === 0) {
    return { nextText: text, replacedCount: 0 };
  }
  result += text.slice(lastIndex);
  return { nextText: result, replacedCount };
}

/**
 * Replaces all occurrences of `targetLowerWord` with `replacementWord` (matching each
 * occurrence's capitalization) across an entire `AdfDocNode`, skipping code blocks and links.
 */
export function replaceAllWordOccurrencesInAdfDoc(
  doc: AdfDocNode,
  targetLowerWord: string,
  replacementWord: string
): { nextDoc: AdfDocNode; replacedCount: number } {
  let replacedCount = 0;

  const transformInline = (
    nodes: AdfInlineNode[] | undefined
  ): AdfInlineNode[] | undefined => {
    if (!nodes || nodes.length === 0) return nodes;
    return normalizeInlineNodes(
      nodes.map((n) => {
        if (n.type !== 'text') return n;
        const hasCodeOrLink = (n.marks || []).some(
          (mk) => mk.type === 'code' || mk.type === 'link'
        );
        if (hasCodeOrLink) return n;
        const nextText = n.text.replace(
          /\b[A-Za-z]+(?:['’][A-Za-z]+)*\b/g,
          (word) => {
            if (
              word.replace(/’/g, "'").toLowerCase() ===
              targetLowerWord.toLowerCase()
            ) {
              replacedCount += 1;
              return matchWordCase(word, replacementWord);
            }
            return word;
          }
        );
        return nextText === n.text ? n : { ...n, text: nextText };
      })
    );
  };

  const transformBlock = (block: AdfBlockNode): AdfBlockNode => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return { ...block, content: transformInline(block.content) };
      case 'bulletList':
      case 'orderedList':
        return {
          ...block,
          content: block.content.map((li) => ({
            ...li,
            content: li.content.map((c) =>
              c.type === 'paragraph'
                ? { ...c, content: transformInline(c.content) }
                : c.type === 'bulletList' || c.type === 'orderedList'
                ? (transformBlock(c) as typeof c)
                : c
            ),
          })),
        };
      case 'taskList':
        return {
          ...block,
          content: block.content.map((item) =>
            item.type === 'taskItem'
              ? { ...item, content: transformInline(item.content) }
              : item
          ),
        };
      case 'decisionList':
        return {
          ...block,
          content: block.content.map((dec) => ({
            ...dec,
            content: transformInline(dec.content),
          })),
        };
      case 'panel':
      case 'blockquote':
      case 'expand':
      case 'nestedExpand':
        return {
          ...block,
          content: block.content.map(transformBlock),
        };
      case 'table':
        return {
          ...block,
          content: block.content.map((row) => ({
            ...row,
            content: row.content.map((cell) => ({
              ...cell,
              content: cell.content.map(transformBlock),
            })),
          })),
        };
      case 'layoutSection':
        return {
          ...block,
          content: block.content.map((col) => ({
            ...col,
            content: col.content.map(transformBlock),
          })),
        };
      default:
        return block;
    }
  };

  const nextContent = doc.content.map(transformBlock);
  return {
    nextDoc: {
      version: 1,
      type: 'doc',
      content: nextContent,
    },
    replacedCount,
  };
}
