import type { FuseNote, NoteProps } from "@dendronhq/common-all";
import { LoadingStatus } from "@dendronhq/common-frontend";
import { AutoComplete, Alert } from "antd";
import React, { useEffect } from "react";
import { useCombinedDispatch } from "../features";
import { browserEngineSlice } from "../features/engine";
import { useFetchFuse } from "../utils/fuse";
import type Fuse from "fuse.js";
import {
  DendronCommonProps,
  DendronPageWithNoteDataProps,
  verifyNoteData,
} from "../utils/types";
import DendronSpinner from "./DendronSpinner";
import _ from "lodash";
import { useNoteBodies } from "../utils/hooks";

/** For notes where nothing in the note body matches, only show this many characters for the note body snippet. */
const MAX_NOTE_SNIPPET_LENGTH = 30;
/** For each matching part in the note body, show this many characters before and after the matching part in each snippet. */
const NOTE_SNIPPET_BEFORE_AFTER = 100;
/** Place this in place of omitted text in between snippet parts. */
const OMITTED_PART_TEXT = " ... ";
/** How long to wait for before triggering fuse search, in ms. Required for performance reasons since fuse search is expensive. */
const SEARCH_DELAY = 100;

export function DendronSearch(props: DendronCommonProps) {
  if (!verifyNoteData(props)) {
    return <DendronSpinner />;
  }

  return <DebouncedDendronSearchComponent {...props} />;
}

type SearchResults = Fuse.FuseResult<NoteProps>[] | undefined;
type SearchFunction = (
  query: string,
  setResults: (results: SearchResults) => void
) => void;

function DebouncedDendronSearchComponent(props: DendronPageWithNoteDataProps) {
  // Splitting this part from DendronSearchComponent so that the debounced
  // function doesn't get reset every time value changes.
  const results = useFetchFuse(props.notes);
  const { fuse } = results;
  // debounce returns stale results until the timeout runs out, which means
  // search would always show stale results. Having the debounced function set
  // state allows the component the update when the function finally runs and
  // gets fresh results.
  const debouncedSearch: SearchFunction | undefined = fuse
    ? _.debounce<SearchFunction>((query, setResults) => {
        setResults(fuse.search(query));
      }, SEARCH_DELAY)
    : undefined;
  return (
    <DendronSearchComponent {...props} {...results} search={debouncedSearch} />
  );
}

type SearchProps = Omit<ReturnType<typeof useFetchFuse>, "fuse"> & {
  search: SearchFunction | undefined;
};

function DendronSearchComponent(
  props: DendronPageWithNoteDataProps & SearchProps
) {
  const dispatch = useCombinedDispatch();
  const { noteBodies, requestNotes } = useNoteBodies();
  const { noteIndex, dendronRouter, search, error, loading, ensureIndexReady } =
    props;
  const [value, setValue] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>(undefined);
  useEffect(() => {
    if (search) search(value, setResults);
  }, [value, search]);
  useEffect(() => {
    requestNotes(results?.map(({ item: note }) => note.id) || []);
  }, [results]);

  if (error) {
    return (
      <Alert
        type="error"
        closable={false}
        message="Error loading data for the search."
      />
    );
  }

  return (
    <AutoComplete
      onClick={ensureIndexReady}
      style={{ width: "100%" }}
      value={value}
      onChange={setValue}
      onSelect={(_selection, option) => {
        const id = option.key?.toString()!;
        dendronRouter.changeActiveNote(id, { noteIndex });
        dispatch(
          browserEngineSlice.actions.setLoadingStatus(LoadingStatus.PENDING)
        );
        setValue("");
      }}
      placeholder={loading ? "Loading Search" : "Search"}
    >
      {results?.map(({ item: note, matches }) => {
        return (
          <AutoComplete.Option key={note.id} value={note.fname}>
            <div className="search-option">
              <MatchTitle matches={matches} note={note} />
              <span
                className="search-fname"
                style={{ marginLeft: "10px", opacity: 0.7 }}
              >
                {note.fname}
              </span>
              <MatchBody
                matches={matches}
                id={note.id}
                noteBodies={noteBodies}
              />
            </div>
          </AutoComplete.Option>
        );
      })}
    </AutoComplete>
  );
}

/** For a fuse.js match on a note, renders the note **title** with the matched parts highlighted.  */
function MatchTitle(props: {
  matches: readonly Fuse.FuseResultMatch[] | undefined;
  note: NoteProps;
}) {
  const { title } = props.note;
  if (_.isUndefined(props.matches)) return <>{title}</>;
  const titleMatches = props.matches
    .filter((match) => match.key === "title")
    .flatMap((match) => match.indices);

  let lastIndex = 0;
  const renderedTitle: (String | JSX.Element)[] = [];
  for (const [startIndex, endIndex] of titleMatches) {
    // Add the part before the match as regular text
    renderedTitle.push(title.slice(lastIndex, startIndex));
    // Add the matched part as bold
    renderedTitle.push(
      <span
        key={`${props.note.id}-${startIndex}-${endIndex}`}
        style={{ fontWeight: "bolder" }}
      >
        {title.slice(startIndex, endIndex + 1)}
      </span>
    );
    lastIndex = endIndex + 1;
  }
  // Add anything after the matches
  renderedTitle.push(title.slice(lastIndex, undefined));

  return <>{renderedTitle}</>;
}

/** Removes repeating newlines from the text. */
function cleanWhitespace(text: string) {
  return _.trim(text, "\n").replaceAll(/\n\n/g, "");
}

/** For a fuse.js match on a note, renders snippets from the note **body** with the matched parts highlighted.  */
function MatchBody(props: {
  matches: readonly Fuse.FuseResultMatch[] | undefined;
  id: string;
  noteBodies: { [noteId: string]: string };
}) {
  const body = props.noteBodies[props.id];
  // May happen when note bodies are still loading
  if (_.isUndefined(body))
    return <span style={{ fontWeight: "lighter" }}>{OMITTED_PART_TEXT}</span>;
  // Map happen if the note only matches with title
  if (_.isUndefined(props.matches))
    return <>{body.slice(undefined, MAX_NOTE_SNIPPET_LENGTH)}</>;
  const bodyMatches = props.matches
    // Extract the ranges of body matches
    .filter((match) => match.key === "body")
    .flatMap((match) => match.indices)
    // Sort from longest range to the shortest
    .sort(([lStart, lEnd], [rStart, rEnd]) => rEnd - rStart - (lEnd - lStart));
  if (bodyMatches.length === 0)
    return <>{body.slice(undefined, MAX_NOTE_SNIPPET_LENGTH)}</>;

  const renderedBody: (String | JSX.Element)[] = [];
  // For simplicity, we highlight the longest range only. Otherwise output looks too complicated.
  const [startIndex, endIndex] = bodyMatches[0];

  const beforeStart = _.max([0, startIndex - NOTE_SNIPPET_BEFORE_AFTER])!;

  // Add a ... part at the start, if we are not at the start of the note
  renderedBody.push(<OmittedText after={0} before={beforeStart} body={body} />);
  // Add the part before the match as regular text
  renderedBody.push(cleanWhitespace(body.slice(beforeStart, startIndex)));

  // Add the matched part as bold
  renderedBody.push(
    <span
      key={`${props.id}-${startIndex}-${endIndex}`}
      style={{ fontWeight: "bold" }}
    >
      {cleanWhitespace(body.slice(startIndex, endIndex + 1))}
    </span>
  );

  // Add the part after the match as regular text
  const afterEnd = endIndex + 1 + NOTE_SNIPPET_BEFORE_AFTER;
  renderedBody.push(cleanWhitespace(body.slice(endIndex + 1, afterEnd)));

  // Add a ... part at the end, if we're not at the end of the note
  renderedBody.push(
    <OmittedText after={afterEnd} before={body.length} body={body} />
  );

  return (
    <div
      style={{
        wordWrap: "break-word",
        whiteSpace: "pre-wrap",
        fontSize: "0.8rem",
        marginLeft: "8px",
      }}
    >
      {renderedBody}
    </div>
  );
}

/** Shows a "..." part that replaces the part of text after `after` and before `before`. */
function OmittedText(props: { after: number; before: number; body: string }) {
  const { after, before, body } = props;
  if (before <= after) return null; // sanity check
  if (OMITTED_PART_TEXT.length >= before - after) {
    // If the gap is smaller than the "..." text, just show the text in that gap instead
    return <>{cleanWhitespace(body.slice(before, after))}</>;
  } else {
    // If the gap is bigger, then show the "..." text
    return <span style={{ fontWeight: "lighter" }}>{OMITTED_PART_TEXT}</span>;
  }
}
