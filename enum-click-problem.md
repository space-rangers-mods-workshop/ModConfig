# ModConfig — почему в enum-строках реагирует только первый пункт

Материал для внешнего разбора. Всё, что нужно, собрано в этом файле: читающий его
человек/модель **не имеет доступа** к нашему исходному коду, поэтому ниже приведены
дословные фрагменты конфигурации и нужные выдержки из реконструированного кода движка.

Дата сборки фактуры: 2026-09-27.

---

## 0. Кратко

Игра — **Space Rangers HD: A War Apart** (далее SRHD), движок Delphi. Мод **ModConfig**
строит внутриигровое окно настроек в космосе. В нём есть правая панель «Расширенная
настройка» с 11 опциями BALANCE: 7 числовых (слайдеры) и 4 переключателя (enum).

**Проблема:** в каждой enum-строке клик по **первому** пункту срабатывает, а клик по
**остальным** пунктам — нет. Состояние переключателя хранится в байте сейва, поэтому
«переключилось / не переключилось» проверяется однозначно.

---

## 1. Что строится

Цель мода — один общий экран конфигурации модов, открываемый в космосе. Слева — список
пунктов (по 12 на страницу, листание кнопками `Back`/`Next`), справа — панель настроек.

Родную форму настроек игры (`TfGameSettings2`, экран `GameSettings`) переиспользовать
нельзя: её вкладки, строки опций и `Ok`/`Cancel` зашиты в код, добавить ничего нельзя.
Поэтому у игры берём **только графику** по ключам кэша (`GI,Bm.FormGameSet2.*`,
`GI,Bm.FormOptions2.*`), а разметку и логику делаем сами.

Окно сделано «кастомной формой»: блок `ML → ModConfigForm`, открывается скриптовой
функцией `OpenCustomForm('ModConfigForm')` и закрывается `CloseCustomForm(1)`. Движок при
открытии замораживает фон (управляющий элемент `BGBuf`), поэтому окно не «просвечивает»
космосом.

---

## 2. Из чего мод вообще состоит (важно для понимания ограничений)

Мод — это два файла BlockPar (собственный бинарный формат «дерево параметров» движка),
плюс `ModuleInfo.txt`. **Кода (DLL/exe) в моде нет.**

- **`Main.dat`** — разметка формы: контролы (`Panel`, `GraphButton`, `Label`, `Image`,
  `GraphBuf`, `PanelScrollBar` …), их геометрия, ключи картинок и блоки-обработчики
  (`OnPressCode`, `OnMouseEnterCode`, `OnMouseLeaveCode`).
- **`Lang.dat`** — тексты и **тела скриптовых функций** (каждая функция — под-блок с
  именем, тело — строки вида `=код`, выполняются по одной).

Из скрипта **нельзя создавать контролы**. Скрипт умеет только показывать/прятать/гасить и
переименовывать/перемещать уже объявленные контролы.

Доступные скриптовые примитивы (кратко, только то, что используется):

| Вызов | Что делает |
|---|---|
| `CustomInterfaceState(name)` | вернуть состояние контрола: `Ord(Active)`, а у кнопки ещё `+Ord(Disabled)` |
| `CustomInterfaceState(name, 0)` | спрятать контрол (`SetActive(False)`) |
| `CustomInterfaceState(name, 1)` | показать/активировать |
| `CustomInterfaceState(name, 2)` | активировать **и** выставить `Disabled=True` |
| `CustomInterfaceText(name)` / `(name, str)` | прочитать / задать текст `Label` или `Edit` |
| `CustomInterfaceImage(name, key)` | подменить картинку (только для картинко-подобных классов) |
| `CustomInterfacePos(name, x, y[, z])` / `CustomInterfaceSize(name, w, h)` | двигать / менять размер |
| `CT(path)` | прочитать параметр конфига; `CT(path, arr)` — дочерние блоки |
| `GenerateCodeStringFromBlock(path)` + `ExecuteCodeFromString(str)` | выполнить скрипт, лежащий в блоке |
| `GalaxyPtr()`, `GoodsCount(ptr, 0)`, `PlanetSetGoods(ptr, 0, v)` | указатель на галактику и чтение/запись по адресу (используются как get/set dword) |
| `NumberBox(...)`, `TextBox(...)` | модальные диалоги ввода |

Диалект скрипта — C-подобный: `int i=0;`, `for(...){}`, `if(...){}`, нет `+=`, нет
`IntToStr`/`StrToInt` (число само склеивается со строкой: `'Пункт '+n`). **Фигурные скобки
`{` `}` внутри значения в `Lang` недопустимы** — это BlockPar, они ломают разбор, поэтому
внутри условий всегда один оператор без скобок.

---

## 3. Устройство окна (текущая сборка)

Корень формы — `ModConfigForm` (`Border=0,0,4096,2160`). В его контентной `Panel` лежат:

- `BGBuf` — `GraphBuf` с замороженным фоном;
- `Pg0..Pg4` — пять невидимых (2×2) `GraphButton`, служат счётчиком страницы: у текущего
  стоит `Disabled` (состояние 2), читается как `CustomInterfaceState('PgN')>1`;
- `scPanel` — окно «Расширенная настройка» (картинка `Bm.FormGameSet2.PanelExt`, 903×629,
  центрируется через `PosAutoCorrection`);
- внутри `scPanel`: заголовок, кнопки `< Back`/`Next >` (`ButPrev`/`ButNext`), 12 слотов
  списка `Item1..Item12` с подписями `ItemT1..ItemT12`, кнопка `ButReset` и
  `PanelScrollBar Name=PanelSet` (`Pos=222,62 Size=569,524`) — правая колонка со скроллом.

**Листание и выбор в левом списке работают** (проверено автоматическим прогоном): `< Back`
/`Next >` листают по 12 пунктов, клик по слоту подсвечивает его (слоты `Kind=Disable`,
текущий получает состояние 2 и префикс `< ` в подписи). Это не предмет проблемы — проблема
только в правой панели.

---

## 4. Правая панель: 11 строк BALANCE

Строки — **дети `PanelSet`** (т.е. «мир» скроллбара; четвёртый компонент `Pos` = литерал
`w`, см. §7). Их 11: 7 числовых (id 1,2,3,4,5,8,16) и 4 переключателя (id 25,27,29,35).

- Числовая строка = `Label` с подписью и значением + стрелки `−`/`+` + самодельный слайдер
  из картинок-половин и клеток.
- Enum-строка = заголовок `Label` + по одному `GraphButton` на каждый вариант значения;
  внутри кнопки — `Label` с подписью варианта и картинка-переключатель
  (`Bm.FormOptions2.2SwitchN` / `2SwitchD`).

Значения строк заполняет скрипт `AARefresh` (см. Приложение B). Значение опции — байт в
сейве по адресу `GalaxyPtr() + 392 + id` (`TGalaxyCustomRules`, 39 байт). Клик по варианту
вызывает `AAChoose` с `param = id*100 + value`, который пишет байт и перезапускает
`AARefresh`.

---

## 5. Точная разметка одной enum-строки (row 8 = `ZeroStartExp`, id 25)

Координаты — относительные `PanelSet` (сам `PanelSet` стоит в `scPanel` в точке `222,62`).
Клик-цели — кнопки `AAChB8_*`.

```
Image ~{  Image=GI,Bm.FormOptions2.2Line  KindX=LeftFill  Name=AASep8  Pos=0,368,-4,w  Size=569,14 }

Label ~{                 Name=AACap8    Pos=0,382,-4,w  Size=569,28   }   # заголовок опции

GraphButton ~{           # вариант 0
    Kind=Normal
    KindHit=Rect
    MouseBlocking=True
    MouseBlockingTest=True
    Name=AAChB8_0
    OnPressCode ~{ 0=ExecuteCodeFromString(GenerateCodeStringFromBlock('ModConfig.Functions.AAChoose'), 'param', 2500); }
    Pos=0,382,-4,w
    Size=519,20
    Label ~{ AlignX=Right  AlignY=Center  Font=Font.2Normal  Name=AAChT8_0  Pos=0,0,-4  Size=492,18  TextColor=205,205,205 }
    Image ~{ Image=GI,Bm.FormOptions2.2SwitchN  Name=AAChk8_0  Pos=502,0,-4  Size=17,17 }
}

GraphButton ~{           # вариант 1
    Kind=Normal
    KindHit=Rect
    MouseBlocking=True
    MouseBlockingTest=True
    Name=AAChB8_1
    OnPressCode ~{ 0=ExecuteCodeFromString(GenerateCodeStringFromBlock('ModConfig.Functions.AAChoose'), 'param', 2501); }
    Pos=0,399,-4,w
    Size=519,20
    Label ~{ ... Name=AAChT8_1  Pos=0,0,-4  Size=492,18 ... }
    Image ~{ Image=GI,Bm.FormOptions2.2SwitchN  Name=AAChk8_1  Pos=502,0,-4  Size=17,17 }
}

Image ~{  Image=GI,Bm.FormOptions2.2Line  KindX=LeftFill  Name=AASep9  Pos=0,413,-4,w  Size=569,14 }
```

Числа для контроля пересечений (по вертикали, локально `PanelSet`):

| элемент | диапазон Y |
|---|---|
| заголовок `AACap8` | 382…410 |
| кнопка варианта 0 `AAChB8_0` | 382…402 |
| кнопка варианта 1 `AAChB8_1` | 399…419 |

Итого: **варианты перекрываются на 3 px (399…402)**, и **заголовок перекрывает вариант 1**
в полосе 399…410. Все три контрола имеют одинаковую глубину `z=-4`.

У строки `HullGrowth` (id 35, row 11) — три варианта; структура та же, каждый следующий
вариант на 17 px ниже.

---

## 6. Симптом (что наблюдается в игре)

Владелец мода, играя в ту же сборку: **в enum-строке срабатывает клик только по первому
пункту; клики по второму (и третьему) пункту ничего не делают.**

Раньше это же было зафиксировано по пикселям: у `ZeroStartExp` клик в полосе первого
варианта выбирает его, а клики в полосе второго варианта не выбирают второй.

Важно: «переключилось» — наблюдаемый и проверяемый факт, потому что байт пишется в
галактику/сейв: закрыть и снова открыть окно — `AARefresh` перечитает байт и отрисует
текущее значение.

---

## 7. Что об этом говорит реконструированный код движка

Ниже — выдержки (по реконструкции исходников, в переводе на псевдокод). Номера строк — из
нашей копии, для внешнего читателя они лишь ориентир.

**Разбор `Pos` и режим `w`** — `TObjectGI.LoadFromBlock`:

```
Pos = "x,y,z[,w]"
LocalPosition.X/Y := x, y
если есть 3-й компонент → SetDepthByName(z)
если 4-й компонент (после Trim) равен литералу 'w' → PositionModeW := True
```

(Число на месте 4-го компонента ничего не задаёт — только литерал `w`.)

**Абсолютная позиция и прямоугольник попадания:**

```
TObjectGI.UpdateAbsolutePosition:
    AbsolutePosition := Parent.GetChildAbsolutePosition(LocalPosition, PositionModeW)

TObjectGI.GetChildAbsolutePosition(Local, ModeW):
    Result.X := AbsolutePosition.X + Local.X      # в реконструкции ModeW игнорируется
    Result.Y := AbsolutePosition.Y + Local.Y

TObjectGI.UpdateHitTestBounds:
    HitTestBounds := Rect(AbsolutePosition - OriginPoint,
                          AbsolutePosition - OriginPoint + ClientSize)

TObjectGI.ContainsPoint(P):
    False если not Active или HitTestDisabled
    иначе P внутри HitTestBounds
```

**Попадание кнопки** — `TGraphButtonGI.HitTest`:

```
если HitKind = Rect      → ContainsPoint(P)
если HitKind = Graph     → HitTestPixel(P) по ImageNormal/Active/Down/… (первое попавшее)
если HitKind = ImageHit  → HitTestPixel(P) по ImageHit
```

У наших enum-кнопок `KindHit=Rect`, картинок у самой кнопки нет.

**Наведение (hover)** — `TGraphButtonGI.ProcessMouseMove`:

```
если MouseBlockingTest и IsOccludedAtPoint(AbsolutePosition) → Exit   # проверка по УГЛУ кнопки
если HitTest(P):
    если не Disabled → MessageLoop.SetHoveredControl(Self)
иначе если HoveredControl = Self → SetHoveredControl(nil)
```

`TObjectGI.ProcessMouseMove` обходит детей **в порядке объявления**; для каждого ребёнка,
содержащего точку, вызывает его `ProcessMouseMove`. Значит hover — это **последний**
содержащий точку элемент, который себя выставил. В движке hover **один на всё окно**.

**Нажатие** — `TGraphButtonGI.ProcessLeftButtonDown` / `…Up`:

```
если IsOccludedAtPoint(P) → Exit
если not HitTest(P) → Exit
если MessageLoop.HoveredControl <> Self → Exit
если (Kind = Disable или FixDisable) и Disabled → Exit
Kind = Normal/Disable:
    на DOWN: Down := True
    на UP:   Down := False; если нет UpCallback и нет DownCallback → ExecuteOnPressCode
```

То есть для `Kind=Normal` обработчик `OnPressCode` вызывается **на отпускании**, и только
если кнопка в этот момент — `HoveredControl`.

**Перекрытие по точке** — `TMessageLoopGI.QueryPointOcclusionState(P, Ignore, Start)`:

```
Start по умолчанию = RootUiObject
если ((Start.Parent<>nil и Start.ContainsPoint(P)) или Start.Parent = nil):
    для детей Start в порядке ПОСЛЕДНИЙ→ПЕРВЫЙ:
        r := Query(P, Ignore, child)
        если r <> 0 → вернуть r
    если Start.MouseBlocking и Start <> Ignore → вернуть 1
вернуть -1 если Start = Ignore иначе 0
```

`IsOccludedAtPoint(P)` считает элемент перекрытым, если результат `= 1`. Иначе говоря:
перекрытие определяется **первым сверху** `MouseBlocking`-контролем, содержащим точку;
не-блокирующие элементы не мешают.

**Глубина:** дети сортируются `InsertOwnedChildByDepth` по убыванию; **меньший `z` — ближе**
(рисуется поверх). У всех строк `z=-4`.

**Скролл:** строки — «мир» `PanelScrollBar`, то есть его дети с `PositionModeW` (`w`);
скроллбар строит диапазон по таким детям и двигает их.

---

## 8. Что уже проверено и исключено

- **Автоматический прогон (синтетические клики через SDK по окну игры) утверждает
  обратное:** после того как `w` проставили каждому контролу строки (и убрали промежуточную
  панель-обёртку с `w`), клики по **обеим** картинкам-переключателям срабатывают: при
  поочерёдном клике 0→1→0→1 значение каждый раз меняется, а переоткрытие окна показывает
  сохранённое значение. То есть расхождение — между синтетическим кликом и живой мышью.
- Первое значение и остальные различает не что-то одно: у них разный `y`, и они
  перекрываются (см. §5). Всё остальное перебрано и **не дало эффекта**: шрифт
  (`2Ranger` vs `2Normal`), литеральный `Text` vs ключ `Lang`, глубина `z=-4` vs `-3`,
  порядок объявления кнопки и подписи, дубликаты имён (их нет), картинки переключателя.
- Промежуточная панель-обёртка с `w` **сдвигала** прямоугольники попадания относительно
  нарисованного (дети `w`-родителя резолвятся иначе) — поэтому обёртку убрали и поставили
  `w` на каждый контрол строки.
- Класс `CountBar` в конфиге значение не показывает (читает только ключи `Image*`,
  `Minimum/Maximum/Position` не читает), поэтому слайдер собран из именованных частей —
  это отдельная история, к enum не относится.

---

## 9. Гипотезы-кандидаты (не проверены окончательно)

1. **Перекрытие прямоугольников + один `HoveredControl`.** Варианты перекрываются на 3 px,
   заголовок лежит поверх обоих; проверка перекрытия у кнопки идёт по её **левому верхнему
   углу**. Если угол нижнего варианта попадает внутрь прямоугольника верхнего (или под
   заголовок), кнопка может считаться перекрытой и не получать hover — а без hover нажатие
   гасится на первой же проверке.
2. **Расхождение «нарисовано» и «попадание» из-за `w`.** Если движок смещает `w`-детей
   скроллбаром при отрисовке, но не при hit-тесте (или наоборот), видимый переключатель
   нижнего варианта оказывается над прямоугольником другого контрола. Тогда живой клик
   промахивается, а синтетический (который может попадать в реальные пиксели картинки)
   попадает.
3. **Перекрытие с заголовком.** Заголовок `AACap8` (569×28) шире кнопок (519×20) и
   пересекает обе строки вариантов; возможно, он «съедает» часть полосы второго варианта.

---

## 10. Вопрос, на который нужен ответ

Дано: мод без кода (только BlockPar-разметка `Main.dat` + скрипт `Lang.dat`), форма
открывается `OpenCustomForm`, контролы создаются из блоков, скрипт умеет только
активировать/гасить/перемещать уже объявленные контролы. Enum-строка объявлена так, как в
§5: заголовок + по одной кнопке `Kind=Normal, KindHit=Rect, MouseBlocking=True,
MouseBlockingTest=True` на вариант, внутри кнопки — `Label` и картинка; клик вызывает
`AAChoose(param=id*100+value)`.

**Почему живой клик мышью срабатывает только по первому пункту enum-строки и не
срабатывает по остальным, и как это исправить в рамках конфигурации?**

Полезно, если ответ объяснит механизм (а не только «сделай X»), потому что у нас уже есть
противоречие между синтетическими кликами и живой мышью, и мы хотим понять его природу.

Ограничения, которые надо учесть:

- создавать контролы скриптом нельзя — только объявлять в разметке;
- скрипт не знает позицию курсора и не имеет таймеров;
- в `Lang` нельзя использовать `{` и `}`;
- доступные примитивы перечислены в §2.

Если решение принципиально требует кода (например, 32-битной DLL, работающей внутри
процесса игры), скажите это прямо — такой вариант мы готовы рассмотреть отдельно.

---

## Приложение A. Полный текст одной enum-строки

Строка 8 (`ZeroStartExp`, id 25) в `Main.dat` построенной сборки (сокращены только повторы
`Font`/`TextColor`):

```
Image ~{
    Image=GI,Bm.FormOptions2.2Line
    KindX=LeftFill
    Name=AASep8
    Pos=0,368,-4,w
    Size=569,14
}
Label ~{
    AlignX=Left
    AlignY=Center
    Font=Font.2Normal
    Name=AACap8
    Pos=0,382,-4,w
    Size=569,28
    TextColor=205,205,205
}
GraphButton ~{
    Kind=Normal
    KindHit=Rect
    MouseBlocking=True
    MouseBlockingTest=True
    Name=AAChB8_0
    OnPressCode ~{
        0=ExecuteCodeFromString(GenerateCodeStringFromBlock('ModConfig.Functions.AAChoose'), 'param', 2500);
    }
    Pos=0,382,-4,w
    Size=519,20
    Label ~{
        AlignX=Right
        AlignY=Center
        Font=Font.2Normal
        Name=AAChT8_0
        Pos=0,0,-4
        Size=492,18
        TextColor=205,205,205
    }
    Image ~{
        Image=GI,Bm.FormOptions2.2SwitchN
        Name=AAChk8_0
        Pos=502,0,-4
        Size=17,17
    }
}
GraphButton ~{
    Kind=Normal
    KindHit=Rect
    MouseBlocking=True
    MouseBlockingTest=True
    Name=AAChB8_1
    OnPressCode ~{
        0=ExecuteCodeFromString(GenerateCodeStringFromBlock('ModConfig.Functions.AAChoose'), 'param', 2501);
    }
    Pos=0,399,-4,w
    Size=519,20
    Label ~{
        AlignX=Right
        AlignY=Center
        Font=Font.2Normal
        Name=AAChT8_1
        Pos=0,0,-4
        Size=492,18
        TextColor=205,205,205
    }
    Image ~{
        Image=GI,Bm.FormOptions2.2SwitchN
        Name=AAChk8_1
        Pos=502,0,-4
        Size=17,17
    }
}
```

Строка целиком (все 11) лежит внутри блока `PanelScrollBar Name=PanelSet` в `Main.dat`.

## Приложение B. Скрипт

`AARefresh` — ветка enum (задаёт тексты и картинки-переключатели; `v` — текущее значение из
сейва, `j` — номер строки, `i` — id опции):

```
=int cnt = CT('ModConfig.AA.' + i + '.cnt');
=CustomInterfaceText('AACap' + j, CT('ModConfig.AA.' + i + '.text'));
=int c = 0;
=for (c = 0; c < cnt; c = c + 1)
 LoopE ~{
    =str col = '';
    =if (c == v) col = '<color=255,234,118>';
    =CustomInterfaceText('AAChT' + j + '_' + c, col + CT('ModConfig.AA.' + i + '.val' + c));
    =str img = 'GI,Bm.FormOptions2.2SwitchN';
    =if (c == v) img = 'GI,Bm.FormOptions2.2SwitchD';
    =CustomInterfaceImage('AAChk' + j + '_' + c, img);
 }
```

`AAChoose` — обработчик клика по варианту:

```
=function SetDword(ptr, value)
 FnSd ~{ =PlanetSetGoods(ptr - 120, 0, value); }
=function GetDword(ptr)
 FnGd ~{ =result = GoodsCount(ptr - 48, 0); }
=function SetByte(ptr, value)
 FnSb ~{ =SetDword(ptr, ~(~GetDword(ptr) | 255) | value); }
=dword G = GalaxyPtr();
=int i = param / 100;
=int c = param % 100;
=SetByte(G + 392 + i, c);
=ExecuteCodeFromString(GenerateCodeStringFromBlock('ModConfig.Functions.AARefresh'));
```

Метаданные вариантов (`cnt`, `val0…valN`, `text`) лежат в `Lang` в блоке `ModConfig.AA.<id>`
и взяты из родной формы игры; порядок строк — `ModConfig.AAOrder.1..11`.

## Приложение C. Соответствие строк и опций

| row (j) | id (i) | тип | значений |
|---|---|---|---|
| 1 | 1 | number | — |
| 2 | 2 | number | — |
| 3 | 3 | number | — |
| 4 | 4 | number | — |
| 5 | 5 | number | — |
| 6 | 8 | number | — |
| 7 | 16 | number | — |
| 8 | 25 | enum | 2 |
| 9 | 27 | enum | 2 |
| 10 | 29 | enum | 2 |
| 11 | 35 | enum | 3 |
