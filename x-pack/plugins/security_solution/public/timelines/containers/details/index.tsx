/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, noop } from 'lodash/fp';
import { useCallback, useEffect, useRef, useState } from 'react';
import deepEqual from 'fast-deep-equal';
import { Subscription } from 'rxjs';

import { inputsModel } from '../../../common/store';
import { useKibana } from '../../../common/lib/kibana';
import {
  DocValueFields,
  TimelineEventsDetailsItem,
  TimelineEventsQueries,
  TimelineEventsDetailsRequestOptions,
  TimelineEventsDetailsStrategyResponse,
} from '../../../../common/search_strategy';
import { isCompleteResponse, isErrorResponse } from '../../../../../../../src/plugins/data/public';
export interface EventsArgs {
  detailsData: TimelineEventsDetailsItem[] | null;
}

export interface UseTimelineEventsDetailsProps {
  docValueFields: DocValueFields[];
  indexName: string;
  eventId: string;
  skip: boolean;
}

export const useTimelineEventsDetails = ({
  docValueFields,
  indexName,
  eventId,
  skip,
}: UseTimelineEventsDetailsProps): [boolean, EventsArgs['detailsData']] => {
  const { data, notifications } = useKibana().services;
  const refetch = useRef<inputsModel.Refetch>(noop);
  const abortCtrl = useRef(new AbortController());
  const searchSubscription$ = useRef(new Subscription());
  const [loading, setLoading] = useState(false);
  const [
    timelineDetailsRequest,
    setTimelineDetailsRequest,
  ] = useState<TimelineEventsDetailsRequestOptions | null>(null);

  const [timelineDetailsResponse, setTimelineDetailsResponse] = useState<EventsArgs['detailsData']>(
    null
  );

  const timelineDetailsSearch = useCallback(
    (request: TimelineEventsDetailsRequestOptions | null) => {
      if (request == null || skip || isEmpty(request.eventId)) {
        return;
      }

      const asyncSearch = async () => {
        abortCtrl.current = new AbortController();
        setLoading(true);

        searchSubscription$.current = data.search
          .search<TimelineEventsDetailsRequestOptions, TimelineEventsDetailsStrategyResponse>(
            request,
            {
              strategy: 'securitySolutionTimelineSearchStrategy',
              abortSignal: abortCtrl.current.signal,
            }
          )
          .subscribe({
            next: (response) => {
              if (isCompleteResponse(response)) {
                setLoading(false);
                setTimelineDetailsResponse(response.data || []);
                searchSubscription$.current.unsubscribe();
              } else if (isErrorResponse(response)) {
                setLoading(false);
                // TODO: Make response error status clearer
                notifications.toasts.addWarning('An error has occurred');
                searchSubscription$.current.unsubscribe();
              }
            },
            error: (msg) => {
              setLoading(false);
              notifications.toasts.addDanger({ title: 'Failed to run search', text: msg.message });
              searchSubscription$.current.unsubscribe();
            },
          });
      };
      searchSubscription$.current.unsubscribe();
      abortCtrl.current.abort();
      asyncSearch();
      refetch.current = asyncSearch;
    },
    [data.search, notifications.toasts, skip]
  );

  useEffect(() => {
    setTimelineDetailsRequest((prevRequest) => {
      const myRequest = {
        ...(prevRequest ?? {}),
        docValueFields,
        indexName,
        eventId,
        factoryQueryType: TimelineEventsQueries.details,
      };
      if (!deepEqual(prevRequest, myRequest)) {
        return myRequest;
      }
      return prevRequest;
    });
  }, [docValueFields, eventId, indexName]);

  useEffect(() => {
    timelineDetailsSearch(timelineDetailsRequest);
    return () => {
      searchSubscription$.current.unsubscribe();
      abortCtrl.current.abort();
    };
  }, [timelineDetailsRequest, timelineDetailsSearch]);

  return [loading, timelineDetailsResponse];
};
