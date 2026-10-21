<template>
  <CardFrame
    kind="stats"
    subtitle="Grey: models next to toDrizzle. Olive: models in their own file."
    footer="A client imports one slim model. tsc 6.0.3 and tsgo."
  >
    <template #title>Own model file: <em>20× less</em> type work</template>
    <CardWindow file="drizzle-type-cost">
      <CardTiles>
        <CardTile value="20×" label="less type work in a full check" />
        <CardTile value="11×" label="smaller bundle on a value import" />
      </CardTiles>
      <CardBars>
        <CardBar label="Full check, 60 tables" before="197,349" after="9,820" unit="steps" />
        <CardBar label="tsgo full check, 60 tables" before="0.55" after="0.23" unit="s" />
        <CardBar label="tsc full check, 60 tables" before="2.23" after="1.12" unit="s" />
        <CardBar label="Files the client loads" before="559" after="257" unit="files" />
        <CardBar label="Bundle, value import" before="121" after="11" unit="KB" />
        <CardBar label="Editor, client file only" before="641" after="641" unit="steps" />
      </CardBars>
    </CardWindow>
  </CardFrame>
</template>
